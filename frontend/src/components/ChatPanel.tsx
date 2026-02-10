import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Send,
  Copy,
  RefreshCw,
  Bot,
  User,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MessageSkeleton } from "@/components/ui/skeleton";
import type { ChatMessage } from "@/types";
import { toast } from "sonner";

interface ChatPanelProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onSendMessage: (message: string) => void;
  onRegenerateMessage: (messageId: string) => void;
  onCodeSelect: (code: string) => void;
}

function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="flex items-start gap-3 p-4"
    >
      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
        <Bot size={16} className="text-primary" />
      </div>
      <div className="bg-card border border-border rounded-xl rounded-tl-none px-4 py-3">
        <div className="flex gap-1.5 items-center h-5">
          <div className="typing-dot w-2 h-2 rounded-full bg-primary" />
          <div className="typing-dot w-2 h-2 rounded-full bg-primary" />
          <div className="typing-dot w-2 h-2 rounded-full bg-primary" />
        </div>
      </div>
    </motion.div>
  );
}

function ChatMessageBubble({
  message,
  onCopy,
  onRegenerate,
  onCodeSelect,
}: {
  message: ChatMessage;
  onCopy: (text: string) => void;
  onRegenerate: (id: string) => void;
  onCodeSelect: (code: string) => void;
}) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={`flex items-start gap-3 p-4 group ${
        isUser ? "flex-row-reverse" : ""
      }`}
    >
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
          isUser
            ? "bg-accent/30"
            : "bg-primary/20"
        }`}
      >
        {isUser ? (
          <User size={16} className="text-accent-foreground" />
        ) : (
          <Bot size={16} className="text-primary" />
        )}
      </div>

      {/* Message content */}
      <div
        className={`relative max-w-[80%] ${isUser ? "items-end" : "items-start"}`}
      >
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            isUser
              ? "bg-primary/20 text-foreground rounded-tr-none"
              : "bg-card border border-border rounded-tl-none"
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose-chat">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code: ({ className, children, ...props }) => {
                    const match = /language-(\w+)/.exec(className || "");
                    const isInline = !match;
                    if (isInline) {
                      return (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    }
                    const codeStr = String(children).replace(/\n$/, "");
                    return (
                      <div className="relative group/code my-2">
                        <div className="flex items-center justify-between bg-secondary/50 px-3 py-1 rounded-t-md text-xs text-muted-foreground">
                          <span>{match[1]}</span>
                          <div className="flex gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5"
                                  onClick={() => {
                                    navigator.clipboard.writeText(codeStr);
                                    toast.success("Code copied to clipboard");
                                  }}
                                >
                                  <Copy size={10} />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Copy code</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5"
                                  onClick={() => onCodeSelect(codeStr)}
                                >
                                  <Sparkles size={10} />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                Open in sandbox
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                        <pre className="!mt-0 !rounded-t-none">
                          <code className={className} {...props}>
                            {children}
                          </code>
                        </pre>
                      </div>
                    );
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Message actions for assistant messages */}
        {!isUser && !message.isStreaming && (
          <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => onCopy(message.content)}
                >
                  <Copy size={12} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy message</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => onRegenerate(message.id)}
                >
                  <RefreshCw size={12} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Regenerate response</TooltipContent>
            </Tooltip>
            {message.generatedCode && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] px-2"
                    onClick={() => onCodeSelect(message.generatedCode!)}
                  >
                    <Sparkles size={10} className="mr-1" />
                    Open in Sandbox
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Load generated code in the sandbox
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function ChatPanel({
  messages,
  isLoading,
  onSendMessage,
  onRegenerateMessage,
  onCodeSelect,
}: ChatPanelProps) {
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSubmit = () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isLoading) return;
    onSendMessage(trimmed);
    setInputValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="px-5 py-3 border-b border-border flex items-center gap-2">
        <Bot size={18} className="text-primary" />
        <h2 className="text-sm font-semibold">Chat</h2>
        <div className="ml-auto flex items-center gap-1">
          {isLoading && (
            <span className="text-xs text-muted-foreground animate-pulse">
              Thinking...
            </span>
          )}
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="min-h-full flex flex-col justify-end">
          {messages.length === 0 && !isLoading && (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                  <Sparkles size={28} className="text-primary" />
                </div>
                <h3 className="text-lg font-semibold">SmartAPI Agent</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Upload API documentation, ask questions, and get executable
                  code with explanations.
                </p>
              </div>
            </div>
          )}

          {isLoading && messages.length === 0 && <MessageSkeleton />}

          <AnimatePresence mode="popLayout">
            {messages.map((msg) => (
              <ChatMessageBubble
                key={msg.id}
                message={msg}
                onCopy={handleCopy}
                onRegenerate={onRegenerateMessage}
                onCodeSelect={onCodeSelect}
              />
            ))}
          </AnimatePresence>

          <AnimatePresence>
            {isLoading && messages.length > 0 && messages[messages.length - 1]?.role === "user" && (
              <TypingIndicator />
            )}
          </AnimatePresence>

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t border-border">
        <div className="flex gap-2 items-end bg-surface rounded-xl border border-border p-2 focus-within:ring-2 focus-within:ring-ring transition-colors">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none min-h-[36px] max-h-[120px] py-2 px-2 w-0"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={handleSubmit}
                disabled={!inputValue.trim() || isLoading}
              >
                <Send size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Send message</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
