import os
import json
import shutil
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from app.models import IngestResponse, QueryRequest, QueryResponse, CodeExecutionRequest, CodeExecutionResponse
from app.services.rag_service import RAGService
from app.services.llm_service import LLMService
from app.services.sandbox_service import SandboxService
import asyncio

router = APIRouter()

rag_service = RAGService()
llm_service = LLMService()
sandbox_service = SandboxService()

@router.post("/ingest", response_model=IngestResponse)
async def ingest_document(file: UploadFile = File(...)):
    """
    Endpoint to Upload PDF.
    It saves the file temporarily, feeds it to RAG service, and then deletes the file.
    """

    try:
        temp_filename = f"temp_{file.filename}"
        with open(temp_filename, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        message = rag_service.ingest_pdf(temp_filename)

        os.remove(temp_filename)

        return IngestResponse(message=message)
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/query", response_model=QueryResponse)
async def query_documentation(request: QueryRequest):
    """
    Endpoint to ask questions.
    RAG -> LLM -> Sandbox
    """

    try:
        context_chunks = rag_service.search(request.question)

        response = llm_service.generate_response(request.question, context_chunks)

        if response.generated_code:
            execution_output = sandbox_service.execute(response.generated_code)
            response.execution_result = execution_output

        return response
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/query/stream")
async def query_documentation_stream(request: QueryRequest):
    """
    Streaming endpoint: sends tokens via Server-Sent Events (SSE).
    """
    async def event_generator():
        try:
            context_chunks = rag_service.search(request.question)
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

            # Send complete response
            yield f"data: {json.dumps({'type': 'complete', 'data': response.model_dump()})}\n\n"
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
async def clear_documents():
    """
    Endpoint to remove all uploaded documents and their vector embeddings.
    """
    try:
        message = rag_service.clear_documents()
        return IngestResponse(message=message)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/execute", response_model=CodeExecutionResponse)
async def execute_code(request: CodeExecutionRequest):
    """
    Endpoint to execute Python code in sandbox.
    """
    try:
        output = sandbox_service.execute(request.code)
        return CodeExecutionResponse(output=output)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))