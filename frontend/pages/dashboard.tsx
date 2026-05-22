import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect } from "react";

import { NewChatForm } from "@/components/NewChatForm";
import { useAuth } from "@/lib/auth";
import { useAuthedSWR } from "@/lib/useAuthedSWR";
import type { ChatSession } from "@/lib/types";

export default function DashboardPage() {
  const router = useRouter();
  const { user, token, loading, logout } = useAuth();
  const { data, isLoading } = useAuthedSWR<{ sessions: ChatSession[] }>("/sessions");

  useEffect(() => {
    if (!loading && !token) router.replace("/login");
  }, [loading, router, token]);

  if (loading || !token) {
    return <main className="grain min-h-screen" />;
  }

  const sessions = data?.sessions ?? [];

  return (
    <main className="grain min-h-screen">
      <div className="mx-auto max-w-7xl px-4 py-5 md:px-6">
        <header className="mb-5 flex flex-col justify-between gap-4 border-b border-[var(--line)] pb-5 md:flex-row md:items-center">
          <div>
            <p className="text-xs font-semibold uppercase text-[var(--muted)]">Documentation QA</p>
            <h1 className="mt-2 text-3xl font-semibold md:text-4xl">Talk to Docs</h1>
          </div>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
            <span className="truncate rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--muted)]">{user?.email}</span>
            <button className="btn-secondary rounded-lg px-4 py-2 text-sm font-semibold" onClick={logout}>
              Logout
            </button>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
          <NewChatForm />
          <section className="rounded-lg border border-[var(--line)] bg-white p-5 shadow-sm md:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-[var(--muted)]">Chat history</p>
                <h2 className="mt-2 text-2xl font-semibold">Previous sources</h2>
              </div>
              <span className="rounded-lg border border-[var(--line)] px-3 py-1 text-xs font-semibold">{sessions.length} sessions</span>
            </div>
            <div className="mt-6 grid gap-3">
              {isLoading ? <p className="text-sm text-[var(--muted)]">Loading sessions...</p> : null}
              {sessions.map((session) => (
                <Link key={session.id} href={`/chat/${session.id}`} className="rounded-lg border border-[var(--line)] bg-white p-4 transition hover:border-[var(--line-strong)] hover:bg-[var(--soft)]">
                  <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold">{session.title || "Untitled documentation"}</p>
                      <p className="mt-1 max-w-xl truncate text-sm text-[var(--muted)]">{session.source_url}</p>
                    </div>
                    <span className="w-fit rounded-lg border border-[var(--line)] px-3 py-1 text-xs font-semibold capitalize">{session.status}</span>
                  </div>
                </Link>
              ))}
              {!isLoading && !sessions.length ? (
                <div className="rounded-lg border border-dashed border-[var(--line)] p-8 text-sm text-[var(--muted)]">
                  Create a new chat by pasting one valid documentation or article URL.
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
