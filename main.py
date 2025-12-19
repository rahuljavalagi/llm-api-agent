import os
import uvicorn
from fastapi import FastAPI
from dotenv import load_dotenv
from pathlib import Path

env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path)

from app.api import router

app = FastAPI(
    title="LLM API Agent",
    description="An AI agent that can read documentation and execute API calls.",
    version="1.0.0"
)

app.include_router(router)

@app.get("/")
def read_root():
    return {"status": "Agent is running", "docs_url": "/docs"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)