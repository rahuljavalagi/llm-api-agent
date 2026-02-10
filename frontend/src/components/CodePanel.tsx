import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Editor, { type OnMount } from "@monaco-editor/react";
import {
  Play,
  Terminal as TerminalIcon,
  Code2,
  Maximize2,
  Minimize2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { executeCode } from "@/services/api";
import { toast } from "sonner";
import type { editor } from "monaco-editor";

interface CodePanelProps {
  code: string;
  onCodeChange: (code: string) => void;
}

export function CodePanel({ code, onCodeChange }: CodePanelProps) {
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  const hasCode = code.trim().length > 0;

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalOutput]);

  const handleEditorMount: OnMount = (editorInstance, monaco) => {
    editorRef.current = editorInstance;

    // Define custom Dracula-inspired theme
    monaco.editor.defineTheme("dracula-custom", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "6272a4", fontStyle: "italic" },
        { token: "keyword", foreground: "ff79c6" },
        { token: "string", foreground: "f1fa8c" },
        { token: "number", foreground: "bd93f9" },
        { token: "type", foreground: "8be9fd", fontStyle: "italic" },
        { token: "function", foreground: "50fa7b" },
        { token: "variable", foreground: "f8f8f2" },
        { token: "operator", foreground: "ff79c6" },
        { token: "delimiter", foreground: "f8f8f2" },
      ],
      colors: {
        "editor.background": "#0f0f23",
        "editor.foreground": "#f8f8f2",
        "editor.lineHighlightBackground": "#1a1a2e",
        "editor.selectionBackground": "#44475a",
        "editorCursor.foreground": "#f8f8f2",
        "editorLineNumber.foreground": "#6272a4",
        "editorLineNumber.activeForeground": "#f8f8f2",
        "editor.selectionHighlightBackground": "#44475a55",
        "editorGutter.background": "#0f0f23",
        "minimap.background": "#0f0f23",
      },
    });
    monaco.editor.setTheme("dracula-custom");

    // Add keyboard shortcut for running code
    editorInstance.addAction({
      id: "run-code",
      label: "Run Code",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => {
        handleRunCode();
      },
    });
  };

  const handleRunCode = useCallback(async () => {
    if (!code.trim() || isExecuting) return;

    setIsExecuting(true);
    setTerminalOutput((prev) => [
      ...prev,
      `$ python script.py`,
      "",
    ]);

    try {
      const output = await executeCode(code);
      setTerminalOutput((prev) => [
        ...prev,
        output,
        "",
        "---",
        "",
      ]);
      toast.success("Code executed successfully");
    } catch (error) {
      const errMsg =
        error instanceof Error ? error.message : "Execution failed";
      setTerminalOutput((prev) => [
        ...prev,
        `ERROR: ${errMsg}`,
        "",
        "---",
        "",
      ]);
      toast.error("Execution failed", { description: errMsg });
    } finally {
      setIsExecuting(false);
    }
  }, [code, isExecuting]);

  const clearTerminal = () => {
    setTerminalOutput([]);
  };

  return (
    <div className={`flex flex-col h-full bg-card border-l border-border ${isMaximized ? "fixed inset-0 z-50" : ""}`}>
      {/* Header */}
      <div className="px-4 py-2 border-b border-border flex items-center gap-2">
        <Code2 size={16} className="text-info" />
        <h2 className="text-sm font-semibold">Sandbox & Terminal</h2>
        <div className="ml-auto flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setIsMaximized(!isMaximized)}
              >
                {isMaximized ? (
                  <Minimize2 size={14} />
                ) : (
                  <Maximize2 size={14} />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isMaximized ? "Minimize" : "Maximize"}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0 relative">
        <Editor
          height="100%"
          defaultLanguage="python"
          value={code}
          onChange={(value) => onCodeChange(value || "")}
          onMount={handleEditorMount}
          options={{
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontLigatures: true,
            minimap: { enabled: true, scale: 1 },
            lineNumbers: "on",
            bracketPairColorization: { enabled: true },
            matchBrackets: "always",
            scrollBeyondLastLine: false,
            automaticLayout: true,
            padding: { top: 12, bottom: 12 },
            renderLineHighlight: "all",
            cursorBlinking: "smooth",
            cursorSmoothCaretAnimation: "on",
            smoothScrolling: true,
            tabSize: 4,
            wordWrap: "on",
            suggest: { showWords: true },
          }}
          loading={
            <div className="flex items-center justify-center h-full bg-surface">
              <Loader2 size={24} className="animate-spin text-primary" />
            </div>
          }
        />

        {/* Run button overlay */}
        <div className="absolute top-3 right-6 z-10">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                className={`gap-1.5 shadow-lg ${
                  hasCode && !isExecuting
                    ? "pulse-glow bg-success text-success-foreground hover:bg-success/90"
                    : ""
                }`}
                onClick={handleRunCode}
                disabled={!hasCode || isExecuting}
              >
                {isExecuting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Play size={14} />
                )}
                <span className="text-xs font-medium">
                  {isExecuting ? "Running..." : "Run"}
                </span>
                {!isExecuting && (
                  <kbd className="ml-1 text-[10px] opacity-60 bg-black/20 px-1 rounded">
                    ⌘+Enter
                  </kbd>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Execute code in sandbox</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Terminal */}
      <div className="border-t border-border">
        <div className="px-4 py-1.5 flex items-center justify-between bg-surface/50">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <TerminalIcon size={12} />
            <span className="font-medium">Terminal</span>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 text-[10px] px-2"
                onClick={clearTerminal}
              >
                Clear
              </Button>
            </TooltipTrigger>
            <TooltipContent>Clear terminal output</TooltipContent>
          </Tooltip>
        </div>

        <ScrollArea className="h-40">
          <div
            ref={terminalRef}
            className="px-4 py-2 font-mono text-xs leading-relaxed"
          >
            <AnimatePresence>
              {terminalOutput.length === 0 ? (
                <p className="text-muted-foreground italic">
                  Terminal output will appear here...
                </p>
              ) : (
                terminalOutput.map((line, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.01 }}
                    className={`whitespace-pre-wrap ${
                      line.startsWith("ERROR")
                        ? "text-destructive"
                        : line.startsWith("$")
                        ? "text-success"
                        : line === "---"
                        ? "text-border"
                        : "text-foreground"
                    }`}
                  >
                    {line === "---" ? (
                      <hr className="border-border my-1" />
                    ) : (
                      line
                    )}
                  </motion.div>
                ))
              )}
            </AnimatePresence>

            {isExecuting && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 text-warning mt-1"
              >
                <Loader2 size={10} className="animate-spin" />
                <span>Executing...</span>
              </motion.div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
