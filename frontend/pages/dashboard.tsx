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
    <main className="grain min-h-screen px-5 py-6 md:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--clay)]">Documentation QA</p>
            <h1 className="mt-2 text-5xl font-black tracking-[-0.06em] md:text-7xl">Talk to Docs</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-black/10 bg-white/40 px-4 py-2 text-sm text-black/60">{user?.email}</span>
            <button className="btn-secondary rounded-full px-4 py-2 text-sm font-bold" onClick={logout}>
              Logout
            </button>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
          <NewChatForm />
          <section className="panel rounded-[2rem] p-6 md:p-8">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--moss)]">Chat history</p>
                <h2 className="mt-2 text-3xl font-black tracking-[-0.04em]">Previous sources</h2>
              </div>
              <span className="rounded-full bg-[var(--sand)] px-3 py-1 text-xs font-bold">{sessions.length} sessions</span>
            </div>
            <div className="mt-6 grid gap-3">
              {isLoading ? <p className="text-sm text-black/50">Loading sessions...</p> : null}
              {sessions.map((session) => (
                <Link key={session.id} href={`/chat/${session.id}`} className="rounded-3xl border border-black/10 bg-white/45 p-4 transition hover:-translate-y-0.5 hover:bg-white/75">
                  <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                    <div>
                      <p className="text-lg font-black tracking-[-0.03em]">{session.title || "Untitled documentation"}</p>
                      <p className="mt-1 max-w-xl truncate text-sm text-black/55">{session.source_url}</p>
                    </div>
                    <span className="w-fit rounded-full border border-black/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em]">{session.status}</span>
                  </div>
                </Link>
              ))}
              {!isLoading && !sessions.length ? (
                <div className="rounded-3xl border border-dashed border-black/15 p-8 text-sm text-black/55">
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
