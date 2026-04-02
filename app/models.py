from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class AuthRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=4, max_length=128)


class AuthResponse(BaseModel):
    token: str
    user_id: int
    username: str


class UserResponse(BaseModel):
    id: int
    username: str


class IngestResponse(BaseModel):
    message: str
    document_id: Optional[str] = None
    chunk_count: Optional[int] = None


class DocumentResponse(BaseModel):
    id: str
    filename: str
    chunk_count: int
    created_at: datetime


class QueryRequest(BaseModel):
    question: str
    chat_session_id: Optional[str] = None


class CodeExecutionRequest(BaseModel):
    code: str


class CodeExecutionResponse(BaseModel):
    output: str


class QueryResponse(BaseModel):
    explanation: str
    generated_code: str
    execution_result: Optional[str] = None


class ChatSessionCreateRequest(BaseModel):
    title: Optional[str] = "New Chat"


class ChatSessionResponse(BaseModel):
    id: str
    title: str
    created_at: datetime


class ChatMessageResponse(BaseModel):
    id: str
    role: str
    content: str
    generated_code: Optional[str] = None
    execution_result: Optional[str] = None
    created_at: datetime