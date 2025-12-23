import os
import chromadb
from typing import List
from pypdf import PdfReader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from chromadb.utils import embedding_functions

class RAGService:
    def __init__(self):
        self.chroma_client = chromadb.PersistentClient(path="./chroma_db")
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GOOGLE_API_KEY is missing. Please add it in .env file.")
        
        self.embedding_fn = embedding_functions.GoogleGenerativeAiEmbeddingFunction(
            api_key=api_key,
            model_name="models/text-embedding-004"
        )

        self.collection = self.chroma_client.get_or_create_collection(
            name="api_docs",
            embedding_function=self.embedding_fn
        )

    def ingest_pdf(self, file_path: str):
        """
        Takes a PDF, reads it, chops it, and saves in database.
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

        existing_ids = self.collection.get()['ids']
        if existing_ids:
            self.collection.delete(ids=existing_ids)

        ids = [f"doc_{i}" for i in range(len(chunks))]

        self.collection.add(
            documents=chunks,
            ids=ids
        )

        return f"Succesfully processed {len(chunks)} chunks from PDF."
    
    def search(self, query: str, n_results: int = 3) -> List[str]:
        """
        Takes a user question, finds the 3 most relevant chunks from database.
        """
        results = self.collection.query(
            query_texts=[query],
            n_results=n_results
        )

        return results['documents'][0]