"use client";

import { Loader2, MessageSquarePlus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ConversationMeta } from "@/types/chat";
import { cn } from "@/lib/utils";

function formatConversationDate(value: Date): string {
  if (!Number.isFinite(value.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

export default function ConversationHistoryDialog({
  open,
  onOpenChange,
  conversations,
  currentConversationId,
  loading,
  hasMore,
  onLoadConversation,
  onDeleteConversation,
  onNewConversation,
  onLoadMore,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversations: ConversationMeta[];
  currentConversationId: string | null;
  loading: boolean;
  hasMore: boolean;
  onLoadConversation: (conversationId: string) => void;
  onDeleteConversation: (conversationId: string) => void;
  onNewConversation: () => void;
  onLoadMore: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="left-auto right-6 top-24 max-w-[420px] translate-x-0 translate-y-0 rounded-[18px] border border-black/[0.08] bg-white p-0 shadow-[0_34px_90px_-50px_rgba(0,0,0,0.3)]"
        showCloseButton
      >
        <div className="space-y-5 p-5">
          <DialogHeader className="space-y-2">
            <DialogTitle className="text-[1.25rem] tracking-tight text-[#161616]">
              Conversation history
            </DialogTitle>
            <DialogDescription className="text-sm leading-6 text-black/62">
              Reload saved chats or start a fresh conversation.
            </DialogDescription>
          </DialogHeader>

          <button
            type="button"
            onClick={onNewConversation}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[12px] border border-black/[0.08] bg-[#f4f8ff] text-sm font-medium text-[#161616] transition-colors hover:bg-[#e9f3ff]"
          >
            <MessageSquarePlus className="h-4 w-4" />
            New conversation
          </button>

          <div className="space-y-2">
            {loading && conversations.length === 0 ? (
              <div className="flex items-center justify-center rounded-[14px] border border-black/[0.08] bg-[#fbfcff] px-4 py-6 text-sm text-black/54">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading conversations...
              </div>
            ) : conversations.length === 0 ? (
              <div className="rounded-[14px] border border-black/[0.08] bg-[#fbfcff] px-4 py-6 text-sm text-black/54">
                No saved conversations yet.
              </div>
            ) : (
              <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                {conversations.map((conversation) => (
                  <div
                    key={conversation.id}
                    className={cn(
                      "rounded-[14px] border p-3 transition-colors",
                      currentConversationId === conversation.id
                        ? "border-[#1080ff]/16 bg-[#f4f8ff]"
                        : "border-black/[0.08] bg-white hover:bg-[#fbfcff]",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => onLoadConversation(conversation.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="truncate text-sm font-medium text-[#161616]">
                          {conversation.title}
                        </p>
                        <p className="mt-1 text-xs text-black/52">
                          {formatConversationDate(conversation.updatedAt)} · {conversation.messageCount} messages
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteConversation(conversation.id)}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-black/[0.08] bg-white text-black/52 transition-colors hover:bg-[#fff1ef] hover:text-[#b93828]"
                        aria-label="Delete conversation"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {hasMore ? (
            <button
              type="button"
              onClick={onLoadMore}
              disabled={loading}
              className={cn(
                "inline-flex h-10 w-full items-center justify-center rounded-[12px] border border-black/[0.08] bg-white text-sm font-medium text-[#161616] transition-colors hover:bg-[#f7fbff]",
                loading && "pointer-events-none opacity-60",
              )}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load more"}
            </button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
