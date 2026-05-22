import { FormEvent, useState } from "react";
import { useRouter } from "next/router";
import { mutate } from "swr";

import { ApiError, apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { ChatSession } from "@/lib/types";

export function NewChatForm({ compact = false }: { compact?: boolean }) {
  const { token } = useAuth();
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await apiRequest<{ session: ChatSession }>("/sessions/new", {
        method: "POST",
        body: JSON.stringify({ url }),
      }, token);
      await mutate((key) => Array.isArray(key) && key[0] === "/sessions");
      router.push(`/chat/${response.session.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create chat");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className={compact ? "space-y-3" : "fade-in rounded-lg border border-[var(--line)] bg-white p-5 shadow-sm md:p-6"}>
      {!compact ? (
        <>
          <p className="text-xs font-semibold uppercase text-[var(--muted)]">New chat</p>
          <h2 className="mt-3 text-2xl font-semibold">Paste one documentation or article URL.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            This URL becomes the only factual source for the session. Social, video, audio, image-only, private-network, and low-text pages are rejected.
          </p>
        </>
      ) : null}
      <div className={compact ? "space-y-3" : "mt-6 flex flex-col gap-3 md:flex-row"}>
        <input
          className="input rounded-lg px-4 py-3 text-sm"
          placeholder="https://docs.example.com/reference/..."
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          required
        />
        <button className="btn-primary whitespace-nowrap rounded-lg px-5 py-3 text-sm font-semibold" disabled={loading}>
          {loading ? "Validating..." : "Start chat"}
        </button>
      </div>
      {error ? <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
    </form>
  );
}
