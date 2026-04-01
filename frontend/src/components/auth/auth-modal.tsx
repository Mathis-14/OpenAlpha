"use client";

import { useState } from "react";
import { Loader2, Mail, UserRound } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type AuthModalMode = "sign-in" | "sign-up";

export default function AuthModal({
  open,
  onOpenChange,
  onGoogleSignIn,
  onEmailSignIn,
  onEmailSignUp,
  loading,
  error,
  configured,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGoogleSignIn: () => Promise<void>;
  onEmailSignIn: (email: string, password: string) => Promise<void>;
  onEmailSignUp: (email: string, password: string) => Promise<void>;
  loading: boolean;
  error: string | null;
  configured: boolean;
}) {
  const [mode, setMode] = useState<AuthModalMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleEmailSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password.trim() || loading || !configured) {
      return;
    }

    if (mode === "sign-up") {
      await onEmailSignUp(email, password);
      return;
    }

    await onEmailSignIn(email, password);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[440px] rounded-[18px] border border-black/[0.08] bg-white p-0 shadow-[0_34px_90px_-50px_rgba(0,0,0,0.3)]">
        <div className="space-y-6 p-5">
          <DialogHeader className="space-y-2">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] border border-[#1080ff]/12 bg-[#eef5ff] text-[#1080ff]">
              <UserRound className="h-5 w-5" />
            </div>
            <DialogTitle className="text-[1.45rem] tracking-tight text-[#161616]">
              Sign in to OpenAlpha
            </DialogTitle>
            <DialogDescription className="text-sm leading-6 text-black/62">
              Sign in to save conversations and unlock the logged-in request tier.
            </DialogDescription>
          </DialogHeader>

          {!configured ? (
            <div className="rounded-[14px] border border-[#b93828]/12 bg-[#fff7f5] px-4 py-3 text-sm text-[#b93828]">
              Firebase is not configured in this environment.
            </div>
          ) : null}

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => {
                void onGoogleSignIn();
              }}
              disabled={loading || !configured}
              className={cn(
                "inline-flex h-11 w-full items-center justify-center gap-2 rounded-[12px] border border-black/[0.08] bg-white text-sm font-medium text-[#161616] transition-colors hover:bg-[#f7fbff]",
                (loading || !configured) && "pointer-events-none opacity-60",
              )}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Continue with Google
            </button>

            <div className="flex items-center gap-3 text-xs uppercase tracking-[0.16em] text-black/36">
              <span className="h-px flex-1 bg-black/[0.08]" />
              Or
              <span className="h-px flex-1 bg-black/[0.08]" />
            </div>

            <form onSubmit={handleEmailSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="auth-email" className="text-sm font-medium text-[#161616]">
                  Email
                </label>
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  className="h-11 w-full rounded-[12px] border border-black/[0.08] bg-[#f7fbff] px-3.5 text-sm text-[#161616] outline-none transition-colors placeholder:text-black/36 focus-visible:border-[#1080ff]/24 focus-visible:ring-4 focus-visible:ring-[#1080ff]/10"
                  placeholder="you@example.com"
                  disabled={loading || !configured}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="auth-password" className="text-sm font-medium text-[#161616]">
                  Password
                </label>
                <input
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                  className="h-11 w-full rounded-[12px] border border-black/[0.08] bg-[#f7fbff] px-3.5 text-sm text-[#161616] outline-none transition-colors placeholder:text-black/36 focus-visible:border-[#1080ff]/24 focus-visible:ring-4 focus-visible:ring-[#1080ff]/10"
                  placeholder="Enter your password"
                  disabled={loading || !configured}
                />
              </div>

              {error ? (
                <p className="text-sm text-[#b93828]">{error}</p>
              ) : null}

              <button
                type="submit"
                disabled={!email.trim() || !password.trim() || loading || !configured}
                className={cn(
                  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-[12px] bg-[#1080ff] px-4 text-sm font-medium text-white transition-colors hover:bg-[#006fe6]",
                  (!email.trim() || !password.trim() || loading || !configured) &&
                    "pointer-events-none opacity-60",
                )}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {mode === "sign-up" ? "Create account" : "Sign in with email"}
              </button>
            </form>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-black/[0.08] pt-4 text-sm text-black/58">
            <span>
              {mode === "sign-up" ? "Already have an account?" : "Need an account?"}
            </span>
            <button
              type="button"
              onClick={() => setMode((current) => (current === "sign-up" ? "sign-in" : "sign-up"))}
              className="font-medium text-[#1080ff] transition-colors hover:text-[#006fe6]"
            >
              {mode === "sign-up" ? "Sign in" : "Create one"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
