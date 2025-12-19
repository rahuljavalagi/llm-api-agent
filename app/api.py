import os
import shutil
from fastapi import APIRouter, UploadFile, File, HTTPException
from app.models import IngestResponse, QueryRequest, QueryResponse
from app.services.rag_service import RAGService
from app.services.llm_service import LLMService
from app.services.sandbox_service import SandboxService

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