import Link from "next/link";
import { Headset, LogOut, Menu, Search } from "lucide-react";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ChatSession, User } from "@/lib/types";

export function ChatSidebar({
  sessions,
  onNewChat,
  onNavigate,
  onClose,
  user,
  onLogout,
}: {
  sessions: ChatSession[];
  onNewChat: () => void;
  onNavigate?: () => void;
  onClose?: () => void;
  user: User | null;
  onLogout: () => void;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement | null>(null);
  const filteredSessions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sessions;
    return sessions.filter((session) => `${session.title} ${session.source_url}`.toLowerCase().includes(query));
  }, [search, sessions]);

  useEffect(() => {
    function closeAccount(event: MouseEvent) {
      if (!accountRef.current?.contains(event.target as Node)) setAccountOpen(false);
    }

    document.addEventListener("mousedown", closeAccount);
    return () => document.removeEventListener("mousedown", closeAccount);
  }, []);

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
      <label className="relative mx-2 mt-2 block">
        <span className="sr-only">Search chats</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
        <input
          className="input h-10 rounded-lg py-2 pl-9 pr-3 text-sm"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search chats"
        />
      </label>
      <div className="scrollbar-thin flex-1 space-y-1 overflow-y-auto p-2">
        {filteredSessions.map((session) => {
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
        {sessions.length && !filteredSessions.length ? (
          <p className="rounded-lg border border-dashed border-[var(--line)] bg-white p-4 text-sm text-[var(--muted)]">No chats match this search.</p>
        ) : null}
      </div>
      <div ref={accountRef} className="relative shrink-0 border-t border-[var(--line)] p-2">
        {accountOpen ? (
          <div className="account-menu absolute bottom-[calc(100%-0.25rem)] left-2 right-2 z-20 rounded-lg border border-[var(--line)] bg-white p-1 shadow-[0_18px_48px_rgba(0,0,0,0.16)]">
            <a
              href="https://itshivam.in"
              target="_blank"
              rel="noreferrer"
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-[var(--soft)]"
            >
              <Headset className="h-4 w-4" />
              Support
            </a>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-[var(--soft)]"
              onClick={onLogout}
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        ) : null}
        <button
          type="button"
          className="flex w-full min-w-0 items-center gap-3 rounded-lg border border-transparent p-2 text-left transition hover:border-[var(--line)] hover:bg-white"
          aria-expanded={accountOpen}
          aria-haspopup="menu"
          onClick={() => setAccountOpen((value) => !value)}
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[var(--line)] bg-white text-xs font-semibold">
            {initials(user)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{user?.name || "Signed in user"}</span>
            <span className="block truncate text-xs text-[var(--muted)]">{user?.email || "Account"}</span>
          </span>
        </button>
      </div>
    </aside>
  );
}

function initials(user: User | null) {
  const source = user?.name.trim() || user?.email.split("@")[0] || "User";
  const parts = source.split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : source.slice(0, 2);
  return letters.toUpperCase();
}
