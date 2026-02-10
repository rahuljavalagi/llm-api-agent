from pydantic import BaseModel
from typing import Optional

class IngestResponse(BaseModel):
    message: str

class QueryRequest(BaseModel):
    question: str

class CodeExecutionRequest(BaseModel):
    code: str

class CodeExecutionResponse(BaseModel):
    output: str

class QueryResponse(BaseModel):
    explanation: str
    generated_code: str
    execution_result: Optional[str] = None