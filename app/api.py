import os
import json
import shutil
import uuid
from functools import lru_cache
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import AuthSession, ChatMessage, ChatSession, User, get_db
from app.models import (
    AuthRequest,
    AuthResponse,
    ChatMessageResponse,
    ChatSessionCreateRequest,
    ChatSessionResponse,
    CodeExecutionRequest,
    CodeExecutionResponse,
    DocumentResponse,
    IngestResponse,
    QueryRequest,
    QueryResponse,
    UserResponse,
)
from app.security import create_session_token, hash_password, verify_password
from app.services.rag_service import RAGService
from app.services.llm_service import LLMService
from app.services.sandbox_service import SandboxService
import asyncio

router = APIRouter()

sandbox_service = SandboxService()

SESSION_DAYS = int(os.getenv("SESSION_DAYS", "30"))


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


@lru_cache(maxsize=1)
def _get_rag_service() -> RAGService:
    return RAGService()


@lru_cache(maxsize=1)
def _get_llm_service() -> LLMService:
    return LLMService()


def _rag_service_or_503() -> RAGService:
    try:
        return _get_rag_service()
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="RAG service unavailable. Check GOOGLE_API_KEY and embedding configuration.",
        )


def _llm_service_or_503() -> LLMService:
    try:
        return _get_llm_service()
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="LLM service unavailable. Check GOOGLE_API_KEY configuration.",
        )


def _chat_session_or_404(db: Session, user_id: int, chat_session_id: str) -> ChatSession:
    session = (
        db.query(ChatSession)
        .filter(ChatSession.id == chat_session_id, ChatSession.user_id == user_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")
    return session


def _persist_chat_exchange(
    db: Session,
    user_id: int,
    chat_session_id: str | None,
    question: str,
    response: QueryResponse,
) -> None:
    if not chat_session_id:
        return

    _chat_session_or_404(db, user_id, chat_session_id)

    user_message = ChatMessage(
        id=uuid.uuid4().hex,
        session_id=chat_session_id,
        user_id=user_id,
        role="user",
        content=question,
        created_at=_now_utc(),
    )
    assistant_message = ChatMessage(
        id=uuid.uuid4().hex,
        session_id=chat_session_id,
        user_id=user_id,
        role="assistant",
        content=response.explanation,
        generated_code=response.generated_code,
        execution_result=response.execution_result,
        created_at=_now_utc(),
    )

    db.add(user_message)
    db.add(assistant_message)
    db.commit()


@router.post("/auth/signup", response_model=AuthResponse)
async def signup(request: AuthRequest, db: Session = Depends(get_db)):
    username = request.username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="Username is required")

    existing_user = db.query(User).filter(User.username == username).first()
    if existing_user:
        raise HTTPException(status_code=409, detail="Username already exists")

    user = User(
        username=username,
        password_hash=hash_password(request.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_session_token()
    db.add(
        AuthSession(
            token=token,
            user_id=user.id,
            created_at=_now_utc(),
            expires_at=_now_utc() + timedelta(days=SESSION_DAYS),
        )
    )
    db.commit()

    return AuthResponse(token=token, user_id=user.id, username=user.username)


@router.post("/auth/login", response_model=AuthResponse)
async def login(request: AuthRequest, db: Session = Depends(get_db)):
    username = request.username.strip()
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="Username not found. Please sign up first")

    if not verify_password(request.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect password")

    token = create_session_token()
    db.add(
        AuthSession(
            token=token,
            user_id=user.id,
            created_at=_now_utc(),
            expires_at=_now_utc() + timedelta(days=SESSION_DAYS),
        )
    )
    db.commit()

    return AuthResponse(token=token, user_id=user.id, username=user.username)


@router.get("/auth/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return UserResponse(id=current_user.id, username=current_user.username)


@router.get("/chats", response_model=list[ChatSessionResponse])
async def list_chats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    sessions = (
        db.query(ChatSession)
        .filter(ChatSession.user_id == current_user.id)
        .order_by(ChatSession.created_at.desc())
        .all()
    )
    return [
        ChatSessionResponse(id=s.id, title=s.title, created_at=s.created_at)
        for s in sessions
    ]


@router.post("/chats", response_model=ChatSessionResponse)
async def create_chat(
    request: ChatSessionCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    title = (request.title or "New Chat").strip() or "New Chat"
    chat_session = ChatSession(
        id=uuid.uuid4().hex,
        user_id=current_user.id,
        title=title,
        created_at=_now_utc(),
    )
    db.add(chat_session)
    db.commit()
    db.refresh(chat_session)

    return ChatSessionResponse(
        id=chat_session.id,
        title=chat_session.title,
        created_at=chat_session.created_at,
    )


@router.get("/chats/{chat_id}/messages", response_model=list[ChatMessageResponse])
async def list_chat_messages(
    chat_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _chat_session_or_404(db, current_user.id, chat_id)

    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == chat_id, ChatMessage.user_id == current_user.id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )

    return [
        ChatMessageResponse(
            id=m.id,
            role=m.role,
            content=m.content,
            generated_code=m.generated_code,
            execution_result=m.execution_result,
            created_at=m.created_at,
        )
        for m in messages
    ]


@router.delete("/chats/{chat_id}", response_model=IngestResponse)
async def delete_chat(
    chat_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    chat_session = _chat_session_or_404(db, current_user.id, chat_id)
    db.delete(chat_session)
    db.commit()
    return IngestResponse(message="Chat deleted")


@router.get("/documents", response_model=list[DocumentResponse])
async def list_documents(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rag_service = _rag_service_or_503()
    documents = rag_service.list_documents(current_user.id, db)
    return [
        DocumentResponse(
            id=d.id,
            filename=d.filename,
            chunk_count=d.chunk_count,
            created_at=d.created_at,
        )
        for d in documents
    ]


@router.post("/ingest", response_model=IngestResponse)
async def ingest_document(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Uploads PDF, stores chunk vectors and chunk metadata.
    """
    rag_service = _rag_service_or_503()
    temp_filename = f"temp_{uuid.uuid4().hex}_{file.filename}"
    try:
        with open(temp_filename, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        result = rag_service.ingest_pdf(
            temp_filename,
            user_id=current_user.id,
            filename=file.filename,
            db=db,
        )

        return IngestResponse(
            message=result["message"],
            document_id=result["document_id"],
            chunk_count=result["chunk_count"],
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(temp_filename):
            os.remove(temp_filename)

@router.post("/query", response_model=QueryResponse)
async def query_documentation(
    request: QueryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Query docs and return explanation + executable code.
    """
    rag_service = _rag_service_or_503()
    llm_service = _llm_service_or_503()

    try:
        context_chunks = rag_service.search(request.question, user_id=current_user.id, db=db)
        if not context_chunks:
            raise HTTPException(status_code=400, detail="No documents found. Upload at least one PDF first.")

        response = llm_service.generate_response(request.question, context_chunks)

        if response.generated_code:
            execution_output = sandbox_service.execute(response.generated_code)
            response.execution_result = execution_output

        _persist_chat_exchange(
            db=db,
            user_id=current_user.id,
            chat_session_id=request.chat_session_id,
            question=request.question,
            response=response,
        )

        return response
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/query/stream")
async def query_documentation_stream(
    request: QueryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Streaming endpoint: sends tokens via Server-Sent Events (SSE).
    """
    rag_service = _rag_service_or_503()
    llm_service = _llm_service_or_503()

    async def event_generator():
        try:
            context_chunks = rag_service.search(request.question, user_id=current_user.id, db=db)
            if not context_chunks:
                raise HTTPException(status_code=400, detail="No documents found. Upload at least one PDF first.")

            response = llm_service.generate_response(request.question, context_chunks)

            # Stream explanation token by token
            words = response.explanation.split(" ")
            for word in words:
                yield f"data: {json.dumps({'type': 'token', 'content': word + ' '})}\n\n"
                await asyncio.sleep(0.03)

            # Send code block
            if response.generated_code:
                yield f"data: {json.dumps({'type': 'code', 'content': response.generated_code})}\n\n"

            # Execute code if present
            if response.generated_code:
                execution_output = sandbox_service.execute(response.generated_code)
                response.execution_result = execution_output

            _persist_chat_exchange(
                db=db,
                user_id=current_user.id,
                chat_session_id=request.chat_session_id,
                question=request.question,
                response=response,
            )

            # Send complete response
            yield f"data: {json.dumps({'type': 'complete', 'data': response.model_dump()})}\n\n"
            yield "data: [DONE]\n\n"

        except HTTPException as e:
            yield f"data: {json.dumps({'type': 'error', 'content': e.detail})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

@router.delete("/documents", response_model=IngestResponse)
async def clear_documents(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Removes all uploaded documents and embeddings for current user.
    """
    rag_service = _rag_service_or_503()
    try:
        message = rag_service.clear_documents(current_user.id, db)
        return IngestResponse(message=message)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/documents/{document_id}", response_model=IngestResponse)
async def delete_document(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rag_service = _rag_service_or_503()
    try:
        message = rag_service.delete_document(current_user.id, document_id, db)
        return IngestResponse(message=message)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/execute", response_model=CodeExecutionResponse)
async def execute_code(
    request: CodeExecutionRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Endpoint to execute Python code in sandbox.
    """
    try:
        output = sandbox_service.execute(request.code)
        return CodeExecutionResponse(output=output)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))