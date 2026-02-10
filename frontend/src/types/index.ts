export interface UploadedFile {
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
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
}
