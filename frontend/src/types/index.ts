export interface UploadedFile {
  id?: string;
  name: string;
  status: "uploading" | "success" | "error";
  progress: number;
  message?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  generatedCode?: string;
  executionResult?: string;
  timestamp: Date;
  isStreaming?: boolean;
}

export interface QueryResponse {
  explanation: string;
  generated_code: string;
  execution_result?: string;
}

export interface IngestResponse {
  message: string;
  document_id?: string;
  chunk_count?: number;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
}

export interface AuthResponse {
  token: string;
  user_id: number;
  username: string;
}

export interface AuthUser {
  id: number;
  username: string;
}

export interface DocumentItem {
  id: string;
  filename: string;
  chunk_count: number;
  created_at: string;
}
