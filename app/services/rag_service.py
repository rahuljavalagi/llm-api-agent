import os
import uuid
from math import sqrt
from typing import List

import google.generativeai as genai
from pypdf import PdfReader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from sqlalchemy.orm import Session

from app.db import Document, DocumentChunk, IS_POSTGRES

class RAGService:
    def __init__(self):
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GOOGLE_API_KEY is missing. Please add it in .env file.")

        genai.configure(api_key=api_key)
        self.embedding_model = os.getenv("EMBEDDING_MODEL", "models/gemini-embedding-001")
        self.embedding_dimensions = int(os.getenv("EMBEDDING_DIMENSION", "768"))

    def _embed_text(self, text: str, task_type: str) -> list[float]:
        if not text.strip():
            return []

        try:
            result = genai.embed_content(
                model=self.embedding_model,
                content=text,
                task_type=task_type,
                output_dimensionality=self.embedding_dimensions,
            )
        except TypeError:
            result = genai.embed_content(
                model=self.embedding_model,
                content=text,
                task_type=task_type,
            )

        if isinstance(result, dict):
            embedding = result.get("embedding")
        else:
            embedding = getattr(result, "embedding", None)
            if embedding is None and hasattr(result, "to_dict"):
                embedding = result.to_dict().get("embedding")

        if not embedding:
            raise ValueError("Embedding model did not return an embedding.")

        return [float(value) for value in embedding]

    @staticmethod
    def _cosine_distance(vector_a: list[float], vector_b: list[float]) -> float:
        if not vector_a or not vector_b:
            return 1.0

        dot = sum(a * b for a, b in zip(vector_a, vector_b))
        norm_a = sqrt(sum(a * a for a in vector_a))
        norm_b = sqrt(sum(b * b for b in vector_b))
        if norm_a == 0 or norm_b == 0:
            return 1.0

        similarity = dot / (norm_a * norm_b)
        return 1.0 - similarity

    def ingest_pdf(self, file_path: str, user_id: int, filename: str, db: Session):
        """
        Reads a PDF, chunks it, and stores chunk content + embeddings in SQL/pgvector.
        """
        reader = PdfReader(file_path)
        text = ""
        for page in reader.pages:
            text += page.extract_text() + "\n"

        if not text.strip():
            raise ValueError("PDF is empty or could not be read.")
        
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size = 1000,
            chunk_overlap = 200
        )
        chunks = text_splitter.split_text(text)

        if not chunks:
            raise ValueError("No text chunks could be created from the PDF.")

        document_id = uuid.uuid4().hex

        try:
            embeddings = [self._embed_text(chunk, "retrieval_document") for chunk in chunks]

            doc_row = Document(
                id=document_id,
                user_id=user_id,
                filename=filename,
                chunk_count=len(chunks),
            )
            db.add(doc_row)

            for index, chunk in enumerate(chunks):
                db.add(
                    DocumentChunk(
                        id=uuid.uuid4().hex,
                        document_id=document_id,
                        user_id=user_id,
                        chunk_index=index,
                        content=chunk,
                        embedding=embeddings[index],
                        # Legacy placeholder kept for backward compatibility with existing schema/index.
                        chroma_id=f"legacy_{uuid.uuid4().hex}",
                    )
                )

            db.commit()
        except Exception:
            db.rollback()
            raise

        return {
            "message": f"Successfully processed {len(chunks)} chunks from {filename}.",
            "document_id": document_id,
            "chunk_count": len(chunks),
        }
    
    def clear_documents(self, user_id: int, db: Session):
        """
        Removes all user documents and chunk embeddings.
        """
        removed_chunks = db.query(DocumentChunk).filter(DocumentChunk.user_id == user_id).count()

        db.query(DocumentChunk).filter(DocumentChunk.user_id == user_id).delete(synchronize_session=False)
        db.query(Document).filter(Document.user_id == user_id).delete(synchronize_session=False)
        db.commit()

        if removed_chunks:
            return f"Successfully removed {removed_chunks} chunks from database."
        return "No documents to remove."

    def list_documents(self, user_id: int, db: Session) -> List[Document]:
        return (
            db.query(Document)
            .filter(Document.user_id == user_id)
            .order_by(Document.created_at.desc())
            .all()
        )

    def delete_document(self, user_id: int, document_id: str, db: Session) -> str:
        document = (
            db.query(Document)
            .filter(Document.id == document_id, Document.user_id == user_id)
            .first()
        )
        if not document:
            raise ValueError("Document not found.")

        removed_chunks = (
            db.query(DocumentChunk)
            .filter(DocumentChunk.document_id == document_id, DocumentChunk.user_id == user_id)
            .count()
        )

        db.query(DocumentChunk).filter(
            DocumentChunk.document_id == document_id,
            DocumentChunk.user_id == user_id,
        ).delete(synchronize_session=False)
        db.delete(document)
        db.commit()

        return f"Successfully removed {removed_chunks} chunks from {document.filename}."

    def search(self, query: str, user_id: int, n_results: int = 5, db: Session | None = None) -> List[str]:
        """
        Retrieves relevant chunks for a specific user.
        """
        if db is None:
            return []

        query_embedding = self._embed_text(query, "retrieval_query")
        if not query_embedding:
            return []

        if IS_POSTGRES:
            try:
                # Use pgvector operator directly because TypeDecorator wrappers
                # do not always expose Vector comparator helper methods.
                matches = (
                    db.query(DocumentChunk)
                    .filter(
                        DocumentChunk.user_id == user_id,
                        DocumentChunk.embedding.isnot(None),
                    )
                    .order_by(DocumentChunk.embedding.op("<=>")(query_embedding))
                    .limit(n_results)
                    .all()
                )
                return [match.content for match in matches]
            except Exception:
                db.rollback()

        # Non-Postgres fallback for local-only runs.
        chunks = (
            db.query(DocumentChunk)
            .filter(
                DocumentChunk.user_id == user_id,
                DocumentChunk.embedding.isnot(None),
            )
            .all()
        )

        scored_chunks = sorted(
            chunks,
            key=lambda chunk: self._cosine_distance(query_embedding, chunk.embedding or []),
        )

        return [chunk.content for chunk in scored_chunks[:n_results]]