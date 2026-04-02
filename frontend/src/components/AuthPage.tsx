import { useState } from "react";
import {
  KeyRound,
  LogIn,
  Sparkles,
  UserPlus,
  Database,
  ShieldCheck,
  MessageSquareText,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { login, signup } from "@/services/api";
import type { AuthUser } from "@/types";

interface AuthPageProps {
  onAuthSuccess: (user: AuthUser) => void;
}

export function AuthPage({ onAuthSuccess }: AuthPageProps) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;

    const cleanUsername = username.trim();
    if (!cleanUsername || !password) {
      setError("Username and password are required.");
      return;
    }

    setError("");
    setIsSubmitting(true);

    try {
      const user =
        mode === "signup"
          ? await signup(cleanUsername, password)
          : await login(cleanUsername, password);

      toast.success(mode === "signup" ? "Signup successful" : "Login successful", {
        description: `Welcome, ${user.username}`,
      });
      onAuthSuccess(user);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Authentication failed";
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <main className="min-h-screen flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-5xl grid gap-4 lg:gap-5 md:grid-cols-[1.05fr_0.95fr]">
          <section className="hidden md:flex flex-col rounded-xl border border-border bg-card p-6 lg:p-7">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
                <Sparkles size={18} className="text-primary" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  Platform Overview
                </p>
                <h2 className="text-xl font-semibold leading-tight mt-1">
                  LLM-Powered <span className="text-primary">SmartAPI</span> Agent
                </h2>
              </div>
            </div>

            <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
              A focused environment for document-grounded API assistance. Keep
              your context, conversations, generated code, and execution outputs
              in one secure place.
            </p>

            <div className="mt-6 space-y-3">
              <div className="rounded-lg border border-border bg-surface px-3 py-2.5 flex items-start gap-2.5">
                <Database size={15} className="text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium">Persistent document context</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    PDFs are chunked and indexed so retrieval stays reliable across sessions.
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-surface px-3 py-2.5 flex items-start gap-2.5">
                <MessageSquareText size={15} className="text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium">Structured chat history</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Conversations remain organized by account and session for easy continuation.
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-surface px-3 py-2.5 flex items-start gap-2.5">
                <ShieldCheck size={15} className="text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium">Controlled code execution</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Review generated code and run it in the built-in sandbox panel.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-lg border border-border bg-surface/50 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                Typical Workflow
              </p>
              <div className="mt-2 space-y-1.5 text-xs text-foreground">
                <p className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  Upload and index your technical documents
                </p>
                <p className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  Ask grounded questions and generate implementation code
                </p>
                <p className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  Execute and iterate in the integrated sandbox
                </p>
              </div>
            </div>
          </section>

          <section className="w-full rounded-xl border border-border bg-card p-5 sm:p-6 shadow-lg shadow-black/20">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3 h-11 w-11 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center">
                <KeyRound size={20} className="text-primary" />
              </div>

              <h2 className="text-2xl font-bold">Welcome Back</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {mode === "signup" ? "Create your account" : "Sign in to continue"}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4 bg-surface rounded-lg p-1 border border-border">
              <Button
                type="button"
                variant={mode === "login" ? "default" : "ghost"}
                onClick={() => {
                  setMode("login");
                  setError("");
                }}
                className="h-9"
              >
                <LogIn size={14} className="mr-2" />
                Login
              </Button>

              <Button
                type="button"
                variant={mode === "signup" ? "default" : "ghost"}
                onClick={() => {
                  setMode("signup");
                  setError("");
                }}
                className="h-9"
              >
                <UserPlus size={14} className="mr-2" />
                Sign up
              </Button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Username
                </label>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  autoComplete="username"
                  maxLength={50}
                  className="bg-surface"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Password
                </label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  className="bg-surface"
                />
              </div>

              {error && (
                <div className="text-xs rounded-md border border-destructive/40 bg-destructive/10 text-destructive px-3 py-2">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full h-10" disabled={isSubmitting}>
                {isSubmitting
                  ? mode === "signup"
                    ? "Creating account..."
                    : "Signing in..."
                  : mode === "signup"
                  ? "Create Account"
                  : "Sign In"}
              </Button>
            </form>

            <p className="text-[11px] text-muted-foreground text-center mt-4">
              Your credentials are stored securely using salted hash + pepper.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
