import Link from "next/link";
import { useRouter } from "next/router";

import type { ChatSession } from "@/lib/types";

export function ChatSidebar({ sessions, onNewChat }: { sessions: ChatSession[]; onNewChat: () => void }) {
  const router = useRouter();
  return (
    <aside className="panel flex h-full min-h-[calc(100vh-2rem)] flex-col rounded-[1.7rem] p-4">
      <div className="flex items-center justify-between gap-3">
        <Link href="/dashboard" className="text-xl font-black tracking-[-0.05em]">
          Talk to Docs
        </Link>
        <button onClick={onNewChat} className="btn-primary rounded-xl px-3 py-2 text-xs font-bold">
          New
        </button>
      </div>
      <div className="mt-5 space-y-2 overflow-y-auto">
        {sessions.map((session) => {
          const active = router.query.sessionId === session.id;
          return (
            <Link
              key={session.id}
              href={`/chat/${session.id}`}
              className={`block rounded-2xl border p-3 transition ${
                active ? "border-[var(--charcoal)] bg-[var(--charcoal)] text-[var(--paper)]" : "border-black/10 bg-white/35 hover:bg-white/70"
              }`}
            >
              <p className="line-clamp-2 text-sm font-bold">{session.title || "Untitled documentation"}</p>
              <p className={`mt-2 truncate text-xs ${active ? "text-white/60" : "text-black/50"}`}>{session.source_url}</p>
              <span className="mt-3 inline-flex rounded-full border border-current/20 px-2 py-1 text-[10px] uppercase tracking-[0.2em]">
                {session.status}
              </span>
            </Link>
          );
        })}
        {!sessions.length ? <p className="rounded-2xl border border-dashed border-black/15 p-4 text-sm text-black/50">No chats yet.</p> : null}
      </div>
    </aside>
  );
}
