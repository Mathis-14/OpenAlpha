"use client";

import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  startAfter,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase";
import type { ChatAgentType, ChatMessage, ConversationMeta } from "@/types/chat";

const PAGE_SIZE = 20;
const MESSAGE_BATCH_SIZE = 400;

function buildConversationTitle(firstMessage: string): string {
  const normalized = firstMessage.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "Untitled conversation";
  }

  return normalized.length > 80 ? `${normalized.slice(0, 77).trim()}...` : normalized;
}

function conversationsCollection() {
  return collection(getFirestoreDb(), "conversations");
}

function messagesCollection(conversationId: string) {
  return collection(getFirestoreDb(), "conversations", conversationId, "messages");
}

function toConversationMeta(snapshot: QueryDocumentSnapshot<DocumentData>): ConversationMeta {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    title: typeof data.title === "string" && data.title.trim() ? data.title : "Untitled conversation",
    agentType: data.agentType === "quant-alpha" ? "quant-alpha" : "alpha",
    messageCount:
      typeof data.messageCount === "number" && Number.isFinite(data.messageCount)
        ? Math.max(0, Math.trunc(data.messageCount))
        : 0,
    createdAt:
      data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(0),
    updatedAt:
      data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : new Date(0),
  };
}

export type ConversationPage = {
  items: ConversationMeta[];
  hasMore: boolean;
  cursor: QueryDocumentSnapshot<DocumentData> | null;
};

export async function createConversation(
  userId: string,
  agentType: ChatAgentType,
  firstMessage: string,
): Promise<string> {
  const now = Timestamp.now();
  const snapshot = await addDoc(conversationsCollection(), {
    userId,
    agentType,
    title: buildConversationTitle(firstMessage),
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
  });

  return snapshot.id;
}

export async function addMessage(
  conversationId: string,
  message: ChatMessage,
): Promise<string> {
  const now = Timestamp.now();
  const messageSnapshot = await addDoc(messagesCollection(conversationId), {
    role: message.role,
    content: message.content,
    entries: message.entries ?? [],
    createdAt: now,
  });

  await updateDoc(doc(getFirestoreDb(), "conversations", conversationId), {
    updatedAt: now,
    messageCount: increment(1),
  });

  return messageSnapshot.id;
}

export async function getMessages(conversationId: string): Promise<ChatMessage[]> {
  const snapshot = await getDocs(
    query(messagesCollection(conversationId), orderBy("createdAt", "asc")),
  );

  return snapshot.docs.map((entry) => {
    const data = entry.data();
    return {
      role: data.role === "assistant" ? "assistant" : "user",
      content: typeof data.content === "string" ? data.content : "",
      entries: Array.isArray(data.entries) ? (data.entries as ChatMessage["entries"]) : undefined,
    };
  });
}

export async function getUserConversations(
  userId: string,
  agentType: ChatAgentType,
  cursor: QueryDocumentSnapshot<DocumentData> | null = null,
): Promise<ConversationPage> {
  const baseQuery = query(
    conversationsCollection(),
    where("userId", "==", userId),
    where("agentType", "==", agentType),
    orderBy("updatedAt", "desc"),
  );

  const snapshot = await getDocs(
    cursor
      ? query(baseQuery, startAfter(cursor), limit(PAGE_SIZE))
      : query(baseQuery, limit(PAGE_SIZE)),
  );

  const items = snapshot.docs.map(toConversationMeta);

  return {
    items,
    hasMore: snapshot.docs.length === PAGE_SIZE,
    cursor: snapshot.docs.at(-1) ?? null,
  };
}

export async function deleteConversation(conversationId: string): Promise<void> {
  const db = getFirestoreDb();

  for (;;) {
    const snapshot = await getDocs(
      query(messagesCollection(conversationId), limit(MESSAGE_BATCH_SIZE)),
    );

    if (snapshot.empty) {
      break;
    }

    const batch = writeBatch(db);
    for (const messageDoc of snapshot.docs) {
      batch.delete(messageDoc.ref);
    }
    await batch.commit();
  }

  await deleteDoc(doc(db, "conversations", conversationId));
}
