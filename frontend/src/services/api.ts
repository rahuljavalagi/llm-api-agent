import type { QueryResponse, IngestResponse } from "@/types";

const BASE_URL = "/api";

export async function ingestDocument(
  file: File,
  onProgress?: (progress: number) => void
): Promise<IngestResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", file);

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

    xhr.open("POST", `${BASE_URL}/ingest`);
    xhr.send(formData);
  });
}

export async function queryDocumentation(
  question: string
): Promise<QueryResponse> {
  const response = await fetch(`${BASE_URL}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });

  if (!response.ok) {
    throw new Error(`Query failed: ${response.statusText}`);
  }

  return response.json();
}

export async function streamQuery(
  question: string,
  onToken: (token: string) => void,
  onCodeBlock: (code: string) => void,
  onComplete: (response: QueryResponse) => void,
  onError: (error: Error) => void
): Promise<void> {
  try {
    const response = await fetch(`${BASE_URL}/query/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });

    if (!response.ok) {
      // Fallback to non-streaming endpoint
      const data = await queryDocumentation(question);
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
          const data = line.slice(6);
          if (data === "[DONE]") {
            if (fullResponse) {
              onComplete(fullResponse);
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
            }
          } catch {
            onToken(data);
          }
        }
      }
    }
  } catch (error) {
    // Try the fallback non-streaming approach
    try {
      const data = await queryDocumentation(question);
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

export async function deleteDocument(): Promise<IngestResponse> {
  const response = await fetch(`${BASE_URL}/documents`, {
    method: "DELETE",
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
  const response = await fetch(`${BASE_URL}/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    throw new Error(`Execution failed: ${response.statusText}`);
  }

  const data = await response.json();
  return data.output;
}
