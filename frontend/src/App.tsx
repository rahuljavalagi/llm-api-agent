import { useState, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import { PanelLeftClose, PanelLeftOpen, Zap } from "lucide-react";
import { Toaster, toast } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Sidebar } from "@/components/Sidebar";
import { ChatPanel } from "@/components/ChatPanel";
import { CodePanel } from "@/components/CodePanel";
import { streamQuery } from "@/services/api";
import type { ChatMessage, ChatSession } from "@/types";

function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sandboxCode, setSandboxCode] = useState("");

  const activeSession = chatSessions.find((s) => s.id === activeChatId);
  const messages = activeSession?.messages || [];

  const ensureActiveChat = useCallback((): string => {
    if (activeChatId) return activeChatId;

    const newSession: ChatSession = {
      id: generateId(),
      title: "New Chat",
      messages: [],
      createdAt: new Date(),
    };
    setChatSessions((prev) => [newSession, ...prev]);
    setActiveChatId(newSession.id);
    return newSession.id;
  }, [activeChatId]);

  const updateSessionMessages = useCallback(
    (sessionId: string, updater: (msgs: ChatMessage[]) => ChatMessage[]) => {
      setChatSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId ? { ...s, messages: updater(s.messages) } : s
        )
      );
    },
    []
  );

  const handleSendMessage = useCallback(
    async (content: string) => {
      const chatId = ensureActiveChat();
      setIsLoading(true);

      const userMessage: ChatMessage = {
        id: generateId(),
        role: "user",
        content,
        timestamp: new Date(),
      };

      // Update session title from first message
      setChatSessions((prev) =>
        prev.map((s) =>
          s.id === chatId && s.messages.length === 0
            ? { ...s, title: content.slice(0, 50) + (content.length > 50 ? "..." : "") }
            : s
        )
      );

      updateSessionMessages(chatId, (msgs) => [...msgs, userMessage]);

      const assistantId = generateId();
      let assistantContent = "";
      let generatedCode = "";

      // Add empty assistant message for streaming
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
        isStreaming: true,
      };
      updateSessionMessages(chatId, (msgs) => [...msgs, assistantMessage]);

      try {
        await streamQuery(
          content,
          // onToken
          (token: string) => {
            assistantContent += token;
            updateSessionMessages(chatId, (msgs) =>
              msgs.map((m) =>
                m.id === assistantId
                  ? { ...m, content: assistantContent, isStreaming: true }
                  : m
              )
            );
          },
          // onCodeBlock
          (code: string) => {
            generatedCode = code;
            setSandboxCode(code);
          },
          // onComplete
          (response) => {
            const finalContent = response.explanation || assistantContent;
            updateSessionMessages(chatId, (msgs) =>
              msgs.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: finalContent,
                      generatedCode: response.generated_code || generatedCode,
                      executionResult: response.execution_result || undefined,
                      isStreaming: false,
                    }
                  : m
              )
            );

            if (response.generated_code) {
              setSandboxCode(response.generated_code);
            }

            if (response.execution_result) {
              toast.info("Code was auto-executed", {
                description: "Check the terminal for results",
              });
            }
          },
          // onError
          (error: Error) => {
            updateSessionMessages(chatId, (msgs) =>
              msgs.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: `Error: ${error.message}`,
                      isStreaming: false,
                    }
                  : m
              )
            );
            toast.error("Failed to get response", {
              description: error.message,
            });
          }
        );
      } catch (error) {
        const errMsg =
          error instanceof Error ? error.message : "Unknown error";
        updateSessionMessages(chatId, (msgs) =>
          msgs.map((m) =>
            m.id === assistantId
              ? { ...m, content: `Error: ${errMsg}`, isStreaming: false }
              : m
          )
        );
        toast.error("Failed to get response");
      } finally {
        setIsLoading(false);
      }
    },
    [ensureActiveChat, updateSessionMessages]
  );

  const handleRegenerateMessage = useCallback(
    async (messageId: string) => {
      if (!activeChatId) return;
      const session = chatSessions.find((s) => s.id === activeChatId);
      if (!session) return;

      // Find the user message before this assistant message
      const msgIndex = session.messages.findIndex((m) => m.id === messageId);
      if (msgIndex <= 0) return;

      const userMessage = session.messages[msgIndex - 1];
      if (userMessage.role !== "user") return;

      // Remove the assistant message
      updateSessionMessages(activeChatId, (msgs) =>
        msgs.filter((m) => m.id !== messageId)
      );

      // Re-send
      await handleSendMessage(userMessage.content);
    },
    [activeChatId, chatSessions, handleSendMessage, updateSessionMessages]
  );

  const handleNewChat = useCallback(() => {
    const newSession: ChatSession = {
      id: generateId(),
      title: "New Chat",
      messages: [],
      createdAt: new Date(),
    };
    setChatSessions((prev) => [newSession, ...prev]);
    setActiveChatId(newSession.id);
  }, []);

  const handleDeleteChat = useCallback(
    (id: string) => {
      setChatSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeChatId === id) {
        setActiveChatId(null);
      }
    },
    [activeChatId]
  );

  const handleCodeSelect = useCallback((code: string) => {
    setSandboxCode(code);
    toast.success("Code loaded in sandbox");
  }, []);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="h-screen w-screen flex flex-col overflow-hidden bg-background">
        {/* Top Bar */}
        <header className="h-12 border-b border-border bg-card flex items-center px-4 gap-3 shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setSidebarOpen(!sidebarOpen)}
              >
                {sidebarOpen ? (
                  <PanelLeftClose size={16} />
                ) : (
                  <PanelLeftOpen size={16} />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {sidebarOpen ? "Close sidebar" : "Open sidebar"}
            </TooltipContent>
          </Tooltip>

          <div className="flex items-center gap-2">
            <Zap size={18} className="text-primary" />
            <h1 className="text-sm font-bold tracking-tight">
              LLM-Powered{" "}
              <span className="text-primary">SmartAPI</span> Agent
            </h1>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground bg-surface px-2 py-0.5 rounded-full font-mono">
              v1.0
            </span>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden min-w-0">
          {/* Sidebar */}
          <AnimatePresence>
            {sidebarOpen && (
              <Sidebar
                chatSessions={chatSessions}
                activeChatId={activeChatId}
                onSelectChat={setActiveChatId}
                onNewChat={handleNewChat}
                onDeleteChat={handleDeleteChat}
                isCollapsed={false}
              />
            )}
          </AnimatePresence>

          {/* Chat Panel */}
          <div
            className="flex-1 min-w-0 border-r border-border"
          >
            <ChatPanel
              messages={messages}
              isLoading={isLoading}
              onSendMessage={handleSendMessage}
              onRegenerateMessage={handleRegenerateMessage}
              onCodeSelect={handleCodeSelect}
            />
          </div>

          {/* Code Panel */}
          <div
            className="w-[45%] min-w-[380px] max-w-[55%]"
          >
            <CodePanel code={sandboxCode} onCodeChange={setSandboxCode} />
          </div>
        </div>
      </div>

      <Toaster
        position="bottom-right"
        theme="dark"
        toastOptions={{
          style: {
            background: "#16213e",
            border: "1px solid #2d2f4a",
            color: "#f8f8f2",
          },
        }}
      />
    </TooltipProvider>
  );
}
