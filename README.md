# LLM-Powered SmartAPI Agent

LLM-Powered SmartAPI Agent is a full-stack application that combines document-grounded AI responses, persistent chat history, and an integrated Python execution sandbox in one workspace.

The app is designed for API exploration workflows where you want to upload technical PDFs, ask implementation questions, generate runnable code, and iterate quickly.

## Why This Project Is Useful

- Retrieval-augmented responses from your own uploaded documentation
- Account-based login and persistent chat sessions
- Built-in code sandbox with terminal output for generated code
- Multi-document ingestion with chunk and embedding persistence
- Production-ready architecture for Netlify (frontend) + Render (backend) + Supabase Postgres/pgvector

## Key Features

### 1. Document-Grounded AI
- Upload PDF/MD/TXT documents from the sidebar
- Content is chunked and embedded for retrieval
- Responses use your uploaded context instead of generic answers

### 2. Persistent User Workspaces
- Username/password authentication
- Session-backed auth tokens
- User-isolated chat history and documents

### 3. Chat + Code in One Screen
- Streaming chat responses
- Generated code appears in Monaco editor
- Run controls and terminal output integrated into the UI

### 4. Production Data Layer
- SQLAlchemy models for users, sessions, chats, documents, and chunks
- pgvector search on Postgres (Supabase)
- Local fallback behavior for non-Postgres runs

## Tech Stack

### Backend
- FastAPI
- SQLAlchemy
- Postgres + pgvector (Supabase)
- Google Gemini API (text + embeddings)

### Frontend
- React + TypeScript + Vite
- Framer Motion
- Monaco Editor
- Tailwind CSS utilities

## Project Structure

```text
.
|-- app/
|   |-- api.py
|   |-- auth.py
|   |-- db.py
|   |-- models.py
|   |-- security.py
|   `-- services/
|       |-- llm_service.py
|       |-- rag_service.py
|       |-- rag_service_chroma.py
|       `-- sandbox_service.py
|-- frontend/
|   |-- src/
|   |   |-- components/
|   |   |-- services/
|   |   `-- types/
|   `-- package.json
|-- .env.example
|-- main.py
`-- requirements.txt
```

## Local Development

### Prerequisites
- Python 3.11+
- Node.js 20+
- npm

### 1. Backend Setup

```powershell
cd llm-api-agent-main
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

Update .env with your secrets and DB URL, then run:

```powershell
python main.py
```

Backend runs on http://127.0.0.1:8000 by default.

### 2. Frontend Setup

```powershell
cd frontend
npm install
copy .env.example .env
npm run dev
```

Frontend runs on http://127.0.0.1:5173 by default.

## Environment Variables

### Backend (.env)

| Variable | Purpose |
|---|---|
| GOOGLE_API_KEY | Gemini API key for generation + embeddings |
| DATABASE_URL | Postgres URL (recommended) or local sqlite |
| PASSWORD_PEPPER | Extra secret used in password hashing |
| SESSION_DAYS | Session token lifetime |
| ALLOWED_ORIGINS | Comma-separated frontend origins for CORS |
| EMBEDDING_MODEL | Embedding model name |
| EMBEDDING_DIMENSION | Vector size (default: 768) |
| APP_ENV | development or production |

### Frontend (frontend/.env)

| Variable | Purpose |
|---|---|
| VITE_API_BASE_URL | Backend API base URL. Use /api for local Vite proxy, Render URL in production |

## Deployment

### Backend on Render
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Set all backend environment variables from the table above
- Set ALLOWED_ORIGINS to your Netlify domain

### Frontend on Netlify
- Base directory: `frontend`
- Build command: `npm run build`
- Publish directory: `dist`
- Set `VITE_API_BASE_URL` to your Render backend URL

### Database on Supabase
- Use Supabase Postgres connection string in DATABASE_URL
- Ensure pgvector is available in your DB project

## Common Checks

- If login works but requests fail in browser, verify ALLOWED_ORIGINS includes your frontend URL.
- If document search is empty, confirm document upload completed and chunk count is non-zero.
- If sandbox output shows external API errors (403/rate limit), the code executed correctly and the issue is with that external API quota.

## Notes

- Keep `.env` out of git.
- Rotate any key if it was ever pasted in logs or screenshots.
- `rag_service_chroma.py` is retained as legacy reference and not wired as active search service.