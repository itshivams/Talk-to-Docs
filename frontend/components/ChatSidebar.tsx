import Link from "next/link";
import { Menu } from "lucide-react";
import { useRouter } from "next/router";

import type { ChatSession } from "@/lib/types";

export function ChatSidebar({
  sessions,
  onNewChat,
  onNavigate,
  onClose,
}: {
  sessions: ChatSession[];
  onNewChat: () => void;
  onNavigate?: () => void;
  onClose?: () => void;
}) {
  const router = useRouter();
  return (
    <aside className="sidebar-surface flex h-full min-h-0 w-full flex-col border-r border-[var(--line)] bg-[var(--soft)]">
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] px-3">
        <div className="flex min-w-0 items-center gap-2">
          {onClose ? (
            <button className="btn-secondary grid h-9 w-9 shrink-0 place-items-center rounded-lg" aria-label="Close sidebar" title="Close sidebar" onClick={onClose}>
              <Menu className="h-4 w-4" />
            </button>
          ) : null}
          <Link href="/dashboard" onClick={onNavigate} className="truncate text-sm font-semibold">
            Talk to Docs
          </Link>
        </div>
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
              className={`session-link block rounded-lg border p-3 transition ${
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
