import Link from "next/link";
import { useRouter } from "next/router";

import type { ChatSession } from "@/lib/types";

export function ChatSidebar({ sessions, onNewChat, onNavigate }: { sessions: ChatSession[]; onNewChat: () => void; onNavigate?: () => void }) {
  const router = useRouter();
  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-[var(--line)] bg-[var(--soft)]">
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] px-3">
        <Link href="/dashboard" onClick={onNavigate} className="truncate text-sm font-semibold">
          Talk to Docs
        </Link>
        <button onClick={onNewChat} className="btn-primary rounded-lg px-3 py-2 text-xs font-semibold">
          New
        </button>
      </div>
      <div className="scrollbar-thin flex-1 space-y-1 overflow-y-auto p-2">
        {sessions.map((session) => {
          const active = router.query.sessionId === session.id;
          return (
            <Link
              key={session.id}
              href={`/chat/${session.id}`}
              onClick={onNavigate}
              className={`block rounded-lg border p-3 transition ${
                active ? "border-black bg-black text-white" : "border-transparent bg-transparent hover:border-[var(--line)] hover:bg-white"
              }`}
            >
              <p className={`line-clamp-2 text-sm font-medium leading-5 ${active ? "text-white" : "text-black"}`}>{session.title || "Untitled documentation"}</p>
              <div className={`mt-2 flex items-center justify-between gap-2 text-xs ${active ? "text-white/60" : "text-[var(--muted)]"}`}>
                <p className="truncate">{session.source_url}</p>
                <span className="shrink-0 capitalize">{session.status}</span>
              </div>
            </Link>
          );
        })}
        {!sessions.length ? <p className="rounded-lg border border-dashed border-[var(--line)] bg-white p-4 text-sm text-[var(--muted)]">No chats yet.</p> : null}
      </div>
    </aside>
  );
}
