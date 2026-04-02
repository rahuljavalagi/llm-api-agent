# Legacy Chroma implementation kept for local experimentation.
# This file is intentionally not wired into the active API flow.

import os
import uuid
import chromadb
from typing import List
from pypdf import PdfReader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from chromadb.utils import embedding_functions
from sqlalchemy.orm import Session

from app.db import Document, DocumentChunk


class RAGServiceChroma:
    def __init__(self):
        chroma_path = os.getenv("CHROMA_DB_PATH", "./chroma_db")
        self.chroma_client = chromadb.PersistentClient(path=chroma_path)
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GOOGLE_API_KEY is missing. Please add it in .env file.")

        self.embedding_fn = embedding_functions.GoogleGenerativeAiEmbeddingFunction(
            api_key=api_key,
            model_name="models/gemini-embedding-001"
        )

        self.collection = self.chroma_client.get_or_create_collection(
            name="api_docs",
            embedding_function=self.embedding_fn
        )

    def ingest_pdf(self, file_path: str, user_id: int, filename: str, db: Session):
        reader = PdfReader(file_path)
        text = ""
        for page in reader.pages:
            text += page.extract_text() + "\n"

        if not text.strip():
            raise ValueError("PDF is empty or could not be read.")

        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200
        )
        chunks = text_splitter.split_text(text)

        document_id = uuid.uuid4().hex
        chroma_ids = [f"u{user_id}_d{document_id}_c{i}" for i in range(len(chunks))]
        metadatas = [
            {
                "user_id": str(user_id),
                "document_id": document_id,
                "filename": filename,
                "chunk_index": i,
            }
            for i in range(len(chunks))
        ]

        self.collection.add(
            documents=chunks,
            ids=chroma_ids,
            metadatas=metadatas,
        )

        try:
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
                        chroma_id=chroma_ids[index],
                    )
                )

            db.commit()
        except Exception:
            db.rollback()
            self.collection.delete(ids=chroma_ids)
            raise

        return {
            "message": f"Successfully processed {len(chunks)} chunks from {filename}.",
            "document_id": document_id,
            "chunk_count": len(chunks),
        }

    def clear_documents(self, user_id: int, db: Session):
        chunks = db.query(DocumentChunk).filter(DocumentChunk.user_id == user_id).all()
        chroma_ids = [chunk.chroma_id for chunk in chunks if chunk.chroma_id]

        if chroma_ids:
            self.collection.delete(ids=chroma_ids)

        removed_chunks = len(chroma_ids)

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

        chunks = (
            db.query(DocumentChunk)
            .filter(DocumentChunk.document_id == document_id, DocumentChunk.user_id == user_id)
            .all()
        )
        chroma_ids = [chunk.chroma_id for chunk in chunks if chunk.chroma_id]
        if chroma_ids:
            self.collection.delete(ids=chroma_ids)

        removed_chunks = len(chroma_ids)
        db.query(DocumentChunk).filter(DocumentChunk.document_id == document_id).delete(synchronize_session=False)
        db.delete(document)
        db.commit()

        return f"Successfully removed {removed_chunks} chunks from {document.filename}."

    def search(self, query: str, user_id: int, n_results: int = 5) -> List[str]:
        results = self.collection.query(
            query_texts=[query],
            n_results=n_results,
            where={"user_id": str(user_id)},
        )

        documents = results.get("documents", [])
        if not documents:
            return []
        return documents[0]
