"use client";

import { useEffect, useState } from "react";
import { Loader2, LockKeyhole } from "lucide-react";
import { unlockUsageQuota } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import type { UsageQuota } from "@/types/api";

export default function UsageUnlockModal({
  open,
  remaining,
  onClose,
  onUnlocked,
}: {
  open: boolean;
  remaining: number;
  onClose: () => void;
  onUnlocked: (quota: UsageQuota) => void;
}) {
  const { getIdToken } = useAuth();
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPassword("");
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  if (!open) {
    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password.trim() || submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const quota = await unlockUsageQuota({ password }, await getIdToken());
      onUnlocked(quota);
    } catch (unlockError) {
      setError(
        unlockError instanceof Error
          ? unlockError.message.includes("invalid_password")
            ? "Incorrect password."
            : unlockError.message.startsWith("unlock_rate_limited")
              ? "Too many attempts. Try again later."
            : unlockError.message
          : "Unable to unlock more requests.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/28 px-4 backdrop-blur-sm">
      <div className="w-full max-w-[420px] rounded-[18px] border border-black/[0.08] bg-white p-5 shadow-[0_28px_80px_-40px_rgba(0,0,0,0.28)]">
        <div className="space-y-2">
          <div className="inline-flex rounded-[12px] bg-[#eef5ff] p-2 text-[#1080ff]">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <h2 className="text-[1.35rem] font-medium tracking-tight text-[#161616]">
            Request limit reached
          </h2>
          <p className="text-sm leading-6 font-light text-black/64">
            You have <span className="font-medium text-[#161616]">{remaining}</span> requests left. Enter your private password to add 20 more.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[#161616]" htmlFor="quota-password">
              Password
            </label>
            <input
              id="quota-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-11 w-full rounded-[12px] border border-black/[0.08] bg-[#f4f8ff] px-3.5 text-sm text-[#161616] outline-none transition-colors placeholder:text-black/36 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-primary/50"
              placeholder="Enter password"
              autoFocus
            />
            {error ? (
              <p className="text-sm text-[#b93828]">{error}</p>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 items-center justify-center rounded-[10px] border border-black/[0.08] bg-white px-4 text-sm text-black/62 transition-colors hover:bg-[#f4f8ff] hover:text-[#161616]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!password.trim() || submitting}
              className={cn(
                "inline-flex h-10 items-center justify-center gap-2 rounded-[10px] bg-[#1080ff] px-4 text-sm font-medium text-white transition-colors hover:bg-[#006fe6]",
                (!password.trim() || submitting) && "pointer-events-none opacity-50",
              )}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Unlock +20
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
