import { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search,
  Upload,
  FileText,
  FolderOpen,
  CheckCircle2,
  XCircle,
  Trash2,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FileSkeleton } from "@/components/ui/skeleton";
import { ingestDocument, deleteDocument, listDocuments } from "@/services/api";
import type { UploadedFile, ChatSession } from "@/types";
import { toast } from "sonner";

interface SidebarProps {
  chatSessions: ChatSession[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void | Promise<void>;
  isCollapsed: boolean;
}

type DeleteTarget = {
  kind: "document" | "chat";
  id: string;
  name: string;
};

export function Sidebar({
  chatSessions,
  activeChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  isCollapsed,
}: SidebarProps) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadDocuments() {
      try {
        const docs = await listDocuments();
        if (!isMounted) return;

        setUploadedFiles(
          docs.map((doc) => ({
            id: doc.id,
            name: doc.filename,
            status: "success",
            progress: 100,
            message: `${doc.chunk_count} chunks stored`,
          }))
        );
      } catch {
        if (isMounted) {
          setUploadedFiles([]);
        }
      }
    }

    loadDocuments();

    return () => {
      isMounted = false;
    };
  }, []);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    for (const file of acceptedFiles) {
      const tempId = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const fileEntry: UploadedFile = {
        id: tempId,
        name: file.name,
        status: "uploading",
        progress: 0,
      };

      setUploadedFiles((prev) => [...prev, fileEntry]);
      setIsUploading(true);

      try {
        const result = await ingestDocument(file, (progress) => {
          setUploadedFiles((prev) =>
            prev.map((f) =>
              f.id === tempId ? { ...f, progress } : f
            )
          );
        });

        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === tempId
              ? {
                  ...f,
                  id: result.document_id || tempId,
                  status: "success",
                  progress: 100,
                  message: result.message,
                }
              : f
          )
        );
        toast.success(`${file.name} uploaded successfully`, {
          description: result.message,
        });
      } catch (error) {
        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === tempId
              ? {
                  ...f,
                  status: "error",
                  message:
                    error instanceof Error ? error.message : "Upload failed",
                }
              : f
          )
        );
        toast.error(`Failed to upload ${file.name}`);
      } finally {
        setIsUploading(false);
      }
    }
  }, []);

  const requestDocumentDelete = useCallback((fileId: string | undefined, fileName: string) => {
    if (!fileId) {
      toast.error(`Missing id for ${fileName}`);
      return;
    }

    setDeleteTarget({ kind: "document", id: fileId, name: fileName });
  }, []);

  const requestChatDelete = useCallback((chatId: string, chatTitle: string) => {
    setDeleteTarget({ kind: "chat", id: chatId, name: chatTitle });
  }, []);

  const closeDeleteDialog = useCallback(() => {
    if (isDeleting) return;
    setDeleteTarget(null);
  }, [isDeleting]);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget || isDeleting) return;

    setIsDeleting(true);
    try {
      if (deleteTarget.kind === "document") {
        const result = await deleteDocument(deleteTarget.id);
        setUploadedFiles((prev) => prev.filter((file) => file.id !== deleteTarget.id));
        toast.success(`${deleteTarget.name} removed`, {
          description: result.message,
        });
      } else {
        await Promise.resolve(onDeleteChat(deleteTarget.id));
      }
      setDeleteTarget(null);
    } catch (error) {
      toast.error(`Failed to remove ${deleteTarget.name}`, {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, isDeleting, onDeleteChat]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "text/markdown": [".md"],
      "text/plain": [".txt"],
    },
    disabled: isUploading,
  });

  const filteredSessions = chatSessions.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredFiles = uploadedFiles.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isCollapsed) return null;

  return (
    <aside
      style={{ width: 288, minWidth: 288, maxWidth: 288 }}
      className="h-full bg-card border-r border-border flex flex-col shrink-0 z-10 overflow-hidden"
    >
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <FolderOpen size={16} className="text-primary" />
          Context & Files
        </h2>
      </div>

      {/* Search */}
      <div className="px-4 py-2">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-xs bg-surface"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="px-4 py-3 space-y-4">
          {/* Upload Section */}
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              <span>Documents</span>
            </div>

            {/* Dropzone */}
            <div
              {...getRootProps()}
              className={`
                border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all duration-200
                ${
                  isDragActive
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:border-accent hover:bg-surface-hover text-muted-foreground"
                }
                ${isUploading ? "pointer-events-none opacity-60" : ""}
              `}
            >
              <input {...getInputProps()} />
              <Upload
                size={20}
                className="mx-auto mb-1 text-muted-foreground"
              />
              <p className="text-xs">
                {isDragActive
                  ? "Drop files here..."
                  : "Drop PDF/MD files or click"}
              </p>
            </div>

            {/* File List */}
            <AnimatePresence>
              {isUploading && uploadedFiles.length === 0 && <FileSkeleton />}
              {filteredFiles.map((file) => (
                <motion.div
                  key={file.id || file.name}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="flex items-center gap-2 p-2 rounded-md bg-surface text-xs min-w-0"
                >
                  {file.status === "uploading" && (
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
                  )}
                  {file.status === "success" && (
                    <CheckCircle2 size={14} className="text-success shrink-0" />
                  )}
                  {file.status === "error" && (
                    <XCircle size={14} className="text-destructive shrink-0" />
                  )}
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <div className="truncate font-medium">{file.name}</div>
                    {file.status === "uploading" && (
                      <Progress value={file.progress} className="mt-1 h-1" />
                    )}
                    {file.message && (
                      <div className="text-muted-foreground truncate mt-0.5 text-[10px]">
                        {file.message}
                      </div>
                    )}
                  </div>
                  {file.status === "success" && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          className="h-6 w-6 shrink-0 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          onClick={() => requestDocumentDelete(file.id, file.name)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Remove from database</TooltipContent>
                    </Tooltip>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Chat Sessions */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-medium uppercase tracking-wider">
              <span>Chat History</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={onNewChat}
                  >
                    <FileText size={12} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>New Chat</TooltipContent>
              </Tooltip>
            </div>

            <AnimatePresence>
              {filteredSessions.map((session) => (
                <motion.div
                  key={session.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className={`
                    group flex items-center gap-2 p-2 rounded-md text-xs cursor-pointer transition-all duration-150 overflow-hidden min-w-0
                    ${
                      activeChatId === session.id
                        ? "bg-primary/15 text-primary border border-primary/30"
                        : "hover:bg-surface-hover text-muted-foreground"
                    }
                  `}
                  onClick={() => onSelectChat(session.id)}
                >
                  <FileText size={13} className="shrink-0" />
                  <span className="truncate flex-1">{session.title}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      requestChatDelete(session.id, session.title);
                    }}
                  >
                    <Trash2 size={10} />
                  </Button>
                </motion.div>
              ))}
            </AnimatePresence>

            {filteredSessions.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                No chats yet. Start a conversation!
              </p>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
          >
            <div
              className="absolute inset-0 bg-background/75 backdrop-blur-sm"
              onClick={closeDeleteDialog}
            />

            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl"
            >
              <div className="p-5 border-b border-border bg-surface/40 rounded-t-2xl">
                <div className="flex items-center gap-2 text-destructive">
                  <AlertTriangle size={17} />
                  <h3 className="text-sm font-semibold">Confirm Deletion</h3>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  This action permanently removes the selected {deleteTarget.kind === "chat" ? "chat" : "document"}.
                </p>
              </div>

              <div className="p-5 space-y-4">
                <div className="rounded-xl border border-border bg-surface/50 px-3 py-2 text-sm text-foreground wrap-break-word">
                  {deleteTarget.name}
                </div>
                <p className="text-xs text-muted-foreground">
                  This cannot be undone.
                </p>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    onClick={closeDeleteDialog}
                    disabled={isDeleting}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleConfirmDelete}
                    disabled={isDeleting}
                    className="min-w-28"
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 size={14} className="animate-spin mr-1.5" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 size={14} className="mr-1.5" />
                        Delete
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  );
}
