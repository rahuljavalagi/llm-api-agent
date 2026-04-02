import type {
  AuthResponse,
  AuthUser,
  ChatMessage,
  ChatSession,
  DocumentItem,
  IngestResponse,
  QueryResponse,
} from "@/types";

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/$/, "");
const TOKEN_KEY = "llm_agent_token";
const USER_KEY = "llm_agent_user";
const REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS ?? "30000");
const STREAM_REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_STREAM_TIMEOUT_MS ?? "180000");
const UPLOAD_TIMEOUT_MS = Number(import.meta.env.VITE_UPLOAD_TIMEOUT_MS ?? "120000");

interface BackendChatSession {
  id: string;
  title: string;
  created_at: string;
}

interface BackendChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  generated_code?: string;
  execution_result?: string;
  created_at: string;
}

function apiUrl(path: string): string {
  return `${BASE_URL}${path}`;
}

function authHeader(): Record<string, string> {
  const token = getStoredToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

async function parseError(response: Response): Promise<string> {
  try {
    const data = await response.json();
    if (typeof data?.detail === "string") {
      return data.detail;
    }
  } catch {
    // ignore and fall back to status text
  }
  return response.statusText || `Request failed (${response.status})`;
}

function createTimeoutError(timeoutMs: number): Error {
  return new Error(
    `Request timed out after ${Math.round(timeoutMs / 1000)}s. Please try again.`
  );
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw createTimeoutError(timeoutMs);
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Network request failed.");
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: HeadersInit = {
    ...authHeader(),
    ...(init.headers || {}),
  };

  const response = await fetchWithTimeout(apiUrl(path), {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return response.json();
}

function mapBackendSession(session: BackendChatSession): ChatSession {
  return {
    id: session.id,
    title: session.title,
    messages: [],
    createdAt: new Date(session.created_at),
  };
}

function mapBackendMessage(message: BackendChatMessage): ChatMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    generatedCode: message.generated_code || undefined,
    executionResult: message.execution_result || undefined,
    timestamp: new Date(message.created_at),
  };
}

export function storeAuth(response: AuthResponse): AuthUser {
  const user: AuthUser = {
    id: response.user_id,
    username: response.username,
  };

  localStorage.setItem(TOKEN_KEY, response.token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  return user;
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    clearAuth();
    return null;
  }
}

export async function signup(username: string, password: string): Promise<AuthUser> {
  const response = await fetchWithTimeout(apiUrl("/auth/signup"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const data = (await response.json()) as AuthResponse;
  return storeAuth(data);
}

export async function login(username: string, password: string): Promise<AuthUser> {
  const response = await fetchWithTimeout(apiUrl("/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const data = (await response.json()) as AuthResponse;
  return storeAuth(data);
}

export async function getCurrentUser(): Promise<AuthUser> {
  return fetchJson<AuthUser>("/auth/me");
}

export async function listChatSessions(): Promise<ChatSession[]> {
  const data = await fetchJson<BackendChatSession[]>("/chats");
  return data.map(mapBackendSession);
}

export async function createChatSession(title = "New Chat"): Promise<ChatSession> {
  const data = await fetchJson<BackendChatSession>("/chats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  return mapBackendSession(data);
}

export async function deleteChatSession(chatId: string): Promise<void> {
  await fetchJson<IngestResponse>(`/chats/${chatId}`, {
    method: "DELETE",
  });
}

export async function listChatMessages(chatId: string): Promise<ChatMessage[]> {
  const data = await fetchJson<BackendChatMessage[]>(`/chats/${chatId}/messages`);
  return data.map(mapBackendMessage);
}

export async function listDocuments(): Promise<DocumentItem[]> {
  return fetchJson<DocumentItem[]>("/documents");
}

export async function ingestDocument(
  file: File,
  onProgress?: (progress: number) => void
): Promise<IngestResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", file);
    xhr.timeout = UPLOAD_TIMEOUT_MS;

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        let errorMsg = `Upload failed (${xhr.status})`;
        try {
          const errData = JSON.parse(xhr.responseText);
          errorMsg = errData.detail || errorMsg;
        } catch {
          // keep default
        }
        reject(new Error(errorMsg));
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Network error during upload"));
    });

    xhr.addEventListener("timeout", () => {
      reject(createTimeoutError(UPLOAD_TIMEOUT_MS));
    });

    xhr.open("POST", apiUrl("/ingest"));
    const token = getStoredToken();
    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    }
    xhr.send(formData);
  });
}

export async function queryDocumentation(
  question: string,
  chatSessionId?: string
): Promise<QueryResponse> {
  const response = await fetchWithTimeout(apiUrl("/query"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeader(),
    },
    body: JSON.stringify({ question, chat_session_id: chatSessionId }),
  }, STREAM_REQUEST_TIMEOUT_MS);

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return response.json();
}

export async function streamQuery(
  question: string,
  chatSessionId: string | undefined,
  onToken: (token: string) => void,
  onCodeBlock: (code: string) => void,
  onComplete: (response: QueryResponse) => void,
  onError: (error: Error) => void
): Promise<void> {
  try {
    const response = await fetchWithTimeout(apiUrl("/query/stream"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeader(),
      },
      body: JSON.stringify({ question, chat_session_id: chatSessionId }),
    }, STREAM_REQUEST_TIMEOUT_MS);

    if (!response.ok) {
      // Fallback to non-streaming endpoint
      const data = await queryDocumentation(question, chatSessionId);
      // Simulate streaming for non-streaming endpoint
      const words = data.explanation.split(" ");
      for (const word of words) {
        onToken(word + " ");
        await new Promise((r) => setTimeout(r, 30));
      }
      if (data.generated_code) {
        onCodeBlock(data.generated_code);
      }
      onComplete(data);
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let fullResponse: QueryResponse | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (data === "[DONE]") {
            if (fullResponse) {
              onComplete(fullResponse);
            } else {
              onError(new Error("No response from LLM"));
            }
            return;
          }
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "token") {
              onToken(parsed.content);
            } else if (parsed.type === "code") {
              onCodeBlock(parsed.content);
            } else if (parsed.type === "complete") {
              fullResponse = parsed.data;
            } else if (parsed.type === "error") {
              onError(new Error(parsed.content || "Query failed"));
              return;
            }
          } catch {
            onToken(data);
          }
        }
      }
    }

    if (fullResponse) {
      onComplete(fullResponse);
    } else {
      onError(new Error("No response from LLM"));
    }
  } catch (error) {
    // Try the fallback non-streaming approach
    try {
      const data = await queryDocumentation(question, chatSessionId);
      const words = data.explanation.split(" ");
      for (const word of words) {
        onToken(word + " ");
        await new Promise((r) => setTimeout(r, 30));
      }
      if (data.generated_code) {
        onCodeBlock(data.generated_code);
      }
      onComplete(data);
    } catch (fallbackError) {
      onError(
        fallbackError instanceof Error
          ? fallbackError
          : new Error("Query failed")
      );
    }
  }
}

export async function deleteDocument(documentId: string): Promise<IngestResponse> {
  const response = await fetchWithTimeout(apiUrl(`/documents/${documentId}`), {
    method: "DELETE",
    headers: {
      ...authHeader(),
    },
  });

  if (!response.ok) {
    let errorMsg = `Delete failed (${response.status})`;
    try {
      const errData = await response.json();
      errorMsg = errData.detail || errorMsg;
    } catch {
      // keep default
    }
    throw new Error(errorMsg);
  }

  return response.json();
}

export async function executeCode(code: string): Promise<string> {
  const response = await fetchWithTimeout(apiUrl("/execute"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeader(),
    },
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const data = await response.json();
  return data.output;
}
