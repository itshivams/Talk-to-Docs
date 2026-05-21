import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { mutate } from "swr";

import { ChatSidebar } from "@/components/ChatSidebar";
import { NewChatForm } from "@/components/NewChatForm";
import { SourceReferences } from "@/components/SourceReferences";
import { ApiError, apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useAuthedSWR } from "@/lib/useAuthedSWR";
import type { ChatSession, Message, SourceReference } from "@/lib/types";

export default function ChatPage() {
  const router = useRouter();
  const sessionId = typeof router.query.sessionId === "string" ? router.query.sessionId : null;
  const { token, loading, logout } = useAuth();
  const [question, setQuestion] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const { data: sessionsData } = useAuthedSWR<{ sessions: ChatSession[] }>("/sessions", { refreshInterval: 5000 });
  const { data: sessionData } = useAuthedSWR<{ session: ChatSession }>(sessionId ? `/sessions/${sessionId}` : null, {
    refreshInterval: (latest) => (latest?.session.status === "ready" || latest?.session.status === "error" ? 0 : 3000),
  });
  const { data: messagesData } = useAuthedSWR<{ messages: Message[] }>(sessionId ? `/chat/${sessionId}/messages` : null, { refreshInterval: 4000 });

  useEffect(() => {
    if (!loading && !token) router.replace("/login");
  }, [loading, router, token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesData?.messages.length, sending]);

  if (loading || !token || !sessionId) {
    return <main className="grain min-h-screen" />;
  }

  const sessions = sessionsData?.sessions ?? [];
  const session = sessionData?.session;
  const messages = messagesData?.messages ?? [];
  const ready = session?.status === "ready";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!question.trim() || !sessionId) return;
    setError("");
    setSending(true);
    const current = question;
    setQuestion("");
    try {
      await apiRequest<{ answer: string; sources: SourceReference[] }>("/chat", {
        method: "POST",
        body: JSON.stringify({ session_id: sessionId, question: current }),
      }, token);
      await mutate((key) => Array.isArray(key) && key[0] === `/chat/${sessionId}/messages`);
      await mutate((key) => Array.isArray(key) && key[0] === "/sessions");
    } catch (err) {
      setQuestion(current);
      setError(err instanceof ApiError ? err.message : "Failed to send question");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="grain min-h-screen p-4">
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <ChatSidebar sessions={sessions} onNewChat={() => setShowNewChat((value) => !value)} />
        <section className="panel flex min-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-[1.7rem]">
          <header className="border-b border-black/10 p-5">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-[var(--clay)]">{session?.status ?? "loading"}</p>
                <h1 className="mt-2 text-3xl font-black tracking-[-0.04em]">{session?.title || "Preparing documentation"}</h1>
                <a className="mt-2 block max-w-3xl truncate text-sm text-black/55" href={session?.source_url} target="_blank" rel="noreferrer">
                  {session?.source_url}
                </a>
              </div>
              <button className="btn-secondary rounded-full px-4 py-2 text-sm font-bold" onClick={logout}>
                Logout
              </button>
            </div>
            {showNewChat ? (
              <div className="mt-5 rounded-3xl border border-black/10 bg-white/35 p-4">
                <NewChatForm compact />
              </div>
            ) : null}
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {!ready ? (
              <div className="rounded-3xl border border-dashed border-black/15 bg-white/40 p-6">
                <p className="text-lg font-black">Scraping and indexing this document.</p>
                <p className="mt-2 text-sm text-black/60">
                  Chat unlocks when the worker finishes. This keeps retrieval scoped to the single URL linked to this session.
                </p>
                {session?.status === "error" ? <p className="mt-3 rounded-2xl bg-red-100 p-3 text-sm text-red-700">Ingestion failed. Try a different documentation URL.</p> : null}
              </div>
            ) : null}

            {messages.map((message) => (
              <article key={message.id ?? `${message.role}-${message.created_at}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-3xl rounded-[1.4rem] px-5 py-4 ${message.role === "user" ? "bg-[var(--charcoal)] text-[var(--paper)]" : "bg-white/65 text-[var(--ink)]"}`}>
                  <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
                  {message.role === "assistant" ? <SourceReferences sources={message.sources || []} /> : null}
                </div>
              </article>
            ))}
            {sending ? <p className="text-sm text-black/50">Retrieving only this session&apos;s document chunks...</p> : null}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={submit} className="border-t border-black/10 p-4">
            {error ? <p className="mb-3 rounded-2xl bg-red-100 px-4 py-3 text-sm text-red-700">{error}</p> : null}
            <div className="flex flex-col gap-3 md:flex-row">
              <textarea
                className="input min-h-24 flex-1 resize-none rounded-2xl px-4 py-3 text-sm"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder={ready ? "Ask a question grounded in this documentation..." : "Waiting for document indexing..."}
                disabled={!ready || sending}
              />
              <button className="btn-primary rounded-2xl px-6 py-3 text-sm font-bold md:w-36" disabled={!ready || sending}>
                {sending ? "Sending" : "Ask"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
