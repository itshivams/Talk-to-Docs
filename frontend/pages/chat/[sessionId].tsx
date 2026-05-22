import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { mutate } from "swr";

import { ChatSidebar } from "@/components/ChatSidebar";
import { AnswerContent } from "@/components/AnswerContent";
import { NewChatForm } from "@/components/NewChatForm";
import { SourceReferences } from "@/components/SourceReferences";
import { ApiError, apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useAuthedSWR } from "@/lib/useAuthedSWR";
import { useChatStream } from "@/lib/useChatStream";
import type { AnswerMode, ChatSession } from "@/lib/types";

const answerModes: { value: AnswerMode; label: string; prompt: string }[] = [
  { value: "ask", label: "Ask", prompt: "" },
  { value: "summarize", label: "Summarize", prompt: "Summarize this document." },
  { value: "explain", label: "Explain simply", prompt: "Explain this document simply." },
  { value: "notes", label: "Notes", prompt: "Generate notes from this document." },
  { value: "quiz", label: "Quiz", prompt: "Create a quiz from this document." },
  { value: "actions", label: "Action items", prompt: "Extract action items from this document." },
];

const progressSteps: ChatSession["status"][] = ["fetching", "parsing", "chunking", "embedding", "ready"];

export default function ChatPage() {
  const router = useRouter();
  const sessionId = typeof router.query.sessionId === "string" ? router.query.sessionId : null;
  const { token, loading, logout } = useAuth();
  const [question, setQuestion] = useState("");
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [mode, setMode] = useState<AnswerMode>("ask");
  const [showNewChat, setShowNewChat] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const { data: sessionsData } = useAuthedSWR<{ sessions: ChatSession[] }>("/sessions");
  const { data: sessionData } = useAuthedSWR<{ session: ChatSession }>(sessionId ? `/sessions/${sessionId}` : null);
  const chatStream = useChatStream(sessionId, token);

  useEffect(() => {
    if (!loading && !token) router.replace("/login");
  }, [loading, router, token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatStream.messages.length, chatStream.streaming]);

  if (loading || !token || !sessionId) {
    return <main className="grain min-h-screen" />;
  }

  const sessions = sessionsData?.sessions ?? [];
  const session = chatStream.session ?? sessionData?.session;
  const messages = chatStream.messages;
  const ready = session?.status === "ready";
  const busy = chatStream.streaming;
  const activeMode = answerModes.find((answerMode) => answerMode.value === mode) ?? answerModes[0];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sessionId) return;
    const current = question.trim() || activeMode.prompt;
    if (!current) return;
    setError("");
    setQuestion("");
    if (!chatStream.ask(current, mode)) {
      setQuestion(current);
    }
  }

  async function retryIngestion() {
    if (!session) return;
    setRetrying(true);
    setError("");
    try {
      await apiRequest("/documents/ingest", {
        method: "POST",
        body: JSON.stringify({ doc_id: session.doc_id, session_id: session.id }),
      }, token);
      await mutate((key) => Array.isArray(key) && (key[0] === "/sessions" || key[0] === `/sessions/${session.id}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to retry ingestion");
    } finally {
      setRetrying(false);
    }
  }

  function askSuggestion(suggestion: string) {
    if (!ready || busy) return;
    setError("");
    setQuestion("");
    setMode("ask");
    chatStream.ask(suggestion, "ask");
  }

  return (
    <main className="grain h-screen overflow-hidden">
      <div className="flex h-full">
        <div className="hidden w-80 shrink-0 lg:block">
          <ChatSidebar sessions={sessions} onNewChat={() => setShowNewChat((value) => !value)} />
        </div>

        {sidebarOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button className="absolute inset-0 bg-black/30" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)} />
            <div className="relative h-full w-[min(86vw,320px)] bg-white shadow-xl">
              <ChatSidebar sessions={sessions} onNewChat={() => setShowNewChat((value) => !value)} onNavigate={() => setSidebarOpen(false)} />
            </div>
          </div>
        ) : null}

        <section className="flex min-w-0 flex-1 flex-col bg-white">
          <header className="shrink-0 border-b border-[var(--line)]">
            <div className="flex h-14 items-center justify-between gap-2 px-3 sm:px-4">
              <div className="flex min-w-0 items-center gap-2">
                <button className="btn-secondary rounded-lg px-3 py-2 text-sm font-semibold lg:hidden" onClick={() => setSidebarOpen(true)}>
                  Menu
                </button>
                <div className="min-w-0">
                  <h1 className="truncate text-sm font-semibold sm:text-base">{session?.title || "Preparing documentation"}</h1>
                  <a className="block truncate text-xs text-[var(--muted)]" href={session?.source_url} target="_blank" rel="noreferrer">
                    {session?.source_url}
                  </a>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="hidden rounded-lg border border-[var(--line)] px-2.5 py-1 text-xs font-medium capitalize text-[var(--muted)] sm:inline-flex">
                  {session?.status ?? "loading"}
                </span>
                <button className="btn-secondary rounded-lg px-3 py-2 text-sm font-semibold" onClick={logout}>
                  Logout
                </button>
              </div>
            </div>
            {showNewChat ? (
              <div className="border-t border-[var(--line)] bg-[var(--soft)] p-3">
                <NewChatForm compact />
              </div>
            ) : null}
          </header>

          <div className="scrollbar-thin flex-1 overflow-y-auto">
            <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 py-5 sm:px-6">
              {!ready ? (
                <div className="rounded-lg border border-dashed border-[var(--line)] bg-[var(--soft)] p-5">
                  <p className="text-base font-semibold">{session?.status === "error" ? "Ingestion failed." : "Preparing this document."}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                    Chat unlocks when fetching, parsing, chunking, and embeddings are complete.
                  </p>
                  <div className="mt-4 grid gap-2 sm:grid-cols-5">
                    {progressSteps.map((step) => (
                      <ProgressStep key={step} step={step} status={session?.status} />
                    ))}
                  </div>
                  {session?.status === "error" ? (
                    <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      <p>{session.error_message || "The worker could not ingest this URL."}</p>
                      <button className="mt-3 rounded-md border border-red-300 bg-white px-3 py-1.5 font-semibold text-red-800" onClick={retryIngestion} disabled={retrying}>
                        {retrying ? "Retrying..." : "Retry ingestion"}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="flex-1 space-y-6">
                {messages.map((message) => (
                  <article key={message.id ?? `${message.role}-${message.created_at}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`rounded-lg px-4 py-3 text-sm leading-6 ${
                        message.role === "user" ? "max-w-[88%] bg-black text-white sm:max-w-[76%]" : "w-full border border-[var(--line)] bg-white text-[var(--ink)]"
                      }`}
                    >
                      {message.role === "assistant" ? <AnswerContent content={message.content} /> : <p className="whitespace-pre-wrap break-words">{message.content}</p>}
                      {message.role === "assistant" ? <SourceReferences sources={message.sources || []} /> : null}
                    </div>
                  </article>
                ))}
                {ready && !messages.length ? (
                  <div className="mx-auto max-w-2xl py-12 text-center">
                    <p className="text-2xl font-semibold">Ask anything about this document.</p>
                    <p className="mt-3 text-sm leading-6 text-[var(--muted)]">Answers are grounded in the URL attached to this chat.</p>
                    {chatStream.suggestions.length ? (
                      <div className="mt-6 flex flex-wrap justify-center gap-2">
                        {chatStream.suggestions.map((suggestion) => (
                          <button key={suggestion} className="btn-secondary rounded-lg px-3 py-2 text-left text-sm" onClick={() => askSuggestion(suggestion)}>
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {chatStream.streaming && !messages.at(-1)?.content ? (
                  <div className="flex justify-start">
                    <div className="rounded-lg border border-[var(--line)] bg-white px-4 py-3 text-sm text-[var(--muted)]">Thinking...</div>
                  </div>
                ) : null}
              </div>
              <div ref={bottomRef} />
            </div>
          </div>

          <form onSubmit={submit} className="shrink-0 border-t border-[var(--line)] bg-white p-3 sm:p-4">
            <div className="mx-auto w-full max-w-3xl">
              {error ? <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
              {chatStream.error ? <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{chatStream.error}</p> : null}
              <div className="mb-2 flex gap-1 overflow-x-auto pb-1">
                {answerModes.map((answerMode) => (
                  <button
                    key={answerMode.value}
                    type="button"
                    className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                      mode === answerMode.value ? "border-black bg-black text-white" : "border-[var(--line)] bg-white text-[var(--muted)] hover:border-[var(--line-strong)]"
                    }`}
                    onClick={() => setMode(answerMode.value)}
                  >
                    {answerMode.label}
                  </button>
                ))}
              </div>
              <div className="flex items-end gap-2 rounded-lg border border-[var(--line)] bg-white p-2 focus-within:border-black focus-within:shadow-[0_0_0_3px_rgba(13,13,13,0.08)]">
                <textarea
                  className="max-h-40 min-h-12 flex-1 resize-none border-0 bg-transparent px-2 py-2 text-sm leading-6 outline-none"
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder={ready ? activeMode.prompt || "Ask a question grounded in this documentation..." : "Waiting for document indexing..."}
                  disabled={!ready || busy}
                />
                <button className="btn-primary h-10 shrink-0 rounded-lg px-4 text-sm font-semibold" disabled={!ready || busy || (!question.trim() && mode === "ask")}>
                  {busy ? "..." : activeMode.label}
                </button>
              </div>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}

function ProgressStep({ step, status }: { step: ChatSession["status"]; status?: ChatSession["status"] }) {
  const stepIndex = progressSteps.indexOf(step);
  const currentIndex = status ? progressSteps.indexOf(status) : -1;
  const reached = status === "ready" || (currentIndex >= 0 && currentIndex >= stepIndex);
  const current = status === step;
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs font-semibold capitalize ${reached ? "border-black bg-black text-white" : "border-[var(--line)] bg-white text-[var(--muted)]"}`}>
      <span className={`mr-2 inline-block h-1.5 w-1.5 rounded-full ${current ? "bg-white" : reached ? "bg-white/70" : "bg-[var(--line-strong)]"}`} />
      {step}
    </div>
  );
}
