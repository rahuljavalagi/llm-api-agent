import { useState, useCallback, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { LogOut, PanelLeftClose, PanelLeftOpen, Zap } from "lucide-react";
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
import { AuthPage } from "@/components/AuthPage";
import {
  clearAuth,
  createChatSession,
  deleteChatSession,
  getCurrentUser,
  getStoredToken,
  getStoredUser,
  listChatMessages,
  listChatSessions,
  streamQuery,
} from "@/services/api";
import type { AuthUser, ChatMessage, ChatSession } from "@/types";

function generateLocalId() {
  return Math.random().toString(36).substring(2, 15);
}

function titleFromContent(content: string): string {
  const clean = content.trim();
  if (!clean) return "New Chat";
  return clean.length > 50 ? `${clean.slice(0, 50)}...` : clean;
}

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [loadedChats, setLoadedChats] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [sandboxCode, setSandboxCode] = useState("");

  const activeSession = chatSessions.find((s) => s.id === activeChatId);
  const messages = activeSession?.messages || [];

  useEffect(() => {
    let isMounted = true;

    async function bootstrapAuth() {
      const token = getStoredToken();
      const localUser = getStoredUser();

      if (!token || !localUser) {
        if (isMounted) {
          setCurrentUser(null);
          setIsAuthLoading(false);
        }
        return;
      }

      try {
        const user = await getCurrentUser();
        if (isMounted) {
          setCurrentUser(user);
        }
      } catch {
        clearAuth();
        if (isMounted) {
          setCurrentUser(null);
        }
      } finally {
        if (isMounted) {
          setIsAuthLoading(false);
        }
      }
    }

    bootstrapAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setChatSessions([]);
      setActiveChatId(null);
      setLoadedChats({});
      return;
    }

    let isMounted = true;

    async function loadSessions() {
      try {
        const sessions = await listChatSessions();
        if (!isMounted) return;

        setChatSessions(sessions);
        setLoadedChats({});
        setActiveChatId((prev) => {
          if (prev && sessions.some((session) => session.id === prev)) {
            return prev;
          }
          return sessions[0]?.id ?? null;
        });
      } catch (error) {
        if (!isMounted) return;
        const message =
          error instanceof Error ? error.message : "Failed to load chats";
        toast.error("Failed to load chats", { description: message });
      }
    }

    loadSessions();

    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || !activeChatId || loadedChats[activeChatId]) {
      return;
    }

    const chatId = activeChatId;

    let isMounted = true;

    async function loadMessages() {
      try {
        const loadedMessages = await listChatMessages(chatId);
        if (!isMounted) return;

        setChatSessions((prev) =>
          prev.map((session) =>
            session.id === chatId
              ? { ...session, messages: loadedMessages }
              : session
          )
        );
        setLoadedChats((prev) => ({ ...prev, [chatId]: true }));
      } catch (error) {
        if (!isMounted) return;
        const message =
          error instanceof Error ? error.message : "Failed to load chat messages";
        toast.error("Failed to load messages", { description: message });
      }
    }

    loadMessages();

    return () => {
      isMounted = false;
    };
  }, [activeChatId, currentUser, loadedChats]);

  const ensureActiveChat = useCallback(async (firstMessage?: string): Promise<string> => {
    if (activeChatId) return activeChatId;

    const newSession = await createChatSession(titleFromContent(firstMessage || ""));
    setChatSessions((prev) => [newSession, ...prev]);
    setActiveChatId(newSession.id);
    setLoadedChats((prev) => ({ ...prev, [newSession.id]: true }));
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
      let chatId = activeChatId;
      if (!chatId) {
        try {
          chatId = await ensureActiveChat(content);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Failed to create chat";
          toast.error("Failed to create chat", { description: message });
          return;
        }
      }

      setIsLoading(true);

      const userMessage: ChatMessage = {
        id: generateLocalId(),
        role: "user",
        content,
        timestamp: new Date(),
      };

      updateSessionMessages(chatId, (msgs) => [...msgs, userMessage]);

      const assistantId = generateLocalId();
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
          chatId,
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
    [activeChatId, ensureActiveChat, updateSessionMessages]
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

  const handleNewChat = useCallback(async () => {
    try {
      const newSession = await createChatSession("New Chat");
      setChatSessions((prev) => [newSession, ...prev]);
      setActiveChatId(newSession.id);
      setLoadedChats((prev) => ({ ...prev, [newSession.id]: true }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create chat";
      toast.error("Failed to create chat", { description: message });
    }
  }, []);

  const handleDeleteChat = useCallback(
    async (id: string) => {
      try {
        await deleteChatSession(id);
        setChatSessions((prev) => prev.filter((s) => s.id !== id));
        setLoadedChats((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        if (activeChatId === id) {
          setActiveChatId(null);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to delete chat";
        toast.error("Failed to delete chat", { description: message });
      }
    },
    [activeChatId]
  );

  const handleCodeSelect = useCallback((code: string) => {
    setSandboxCode(code);
    toast.success("Code loaded in sandbox");
  }, []);

  const handleAuthSuccess = useCallback((user: AuthUser) => {
    setCurrentUser(user);
    setIsAuthLoading(false);
  }, []);

  const handleLogout = useCallback(() => {
    clearAuth();
    setCurrentUser(null);
    setChatSessions([]);
    setActiveChatId(null);
    setLoadedChats({});
    setSandboxCode("");
    toast.success("Logged out");
  }, []);

  return (
    <TooltipProvider delayDuration={200}>
      {isAuthLoading ? (
        <div className="h-screen w-screen flex items-center justify-center bg-background text-sm text-muted-foreground">
          Checking session...
        </div>
      ) : !currentUser ? (
        <AuthPage onAuthSuccess={handleAuthSuccess} />
      ) : (
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
              <span className="text-[11px] text-muted-foreground bg-surface px-2 py-0.5 rounded-full">
                @{currentUser.username}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={handleLogout}
              >
                <LogOut size={14} className="mr-1.5" />
                Logout
              </Button>
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
              className="w-[45%] min-w-95 max-w-[55%]"
            >
              <CodePanel code={sandboxCode} onCodeChange={setSandboxCode} />
            </div>
          </div>
        </div>
      )}

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
