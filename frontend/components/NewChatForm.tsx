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
    <form onSubmit={submit} className={compact ? "space-y-3" : "panel fade-in rounded-[2rem] p-6 md:p-8"}>
      {!compact ? (
        <>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--clay)]">New chat</p>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.04em]">Paste one documentation or article URL.</h2>
          <p className="mt-2 max-w-2xl text-sm text-black/60">
            This URL becomes the only factual source for the session. Social, video, audio, image-only, private-network, and low-text pages are rejected.
          </p>
        </>
      ) : null}
      <div className={compact ? "space-y-3" : "mt-6 flex flex-col gap-3 md:flex-row"}>
        <input
          className="input rounded-2xl px-4 py-3 text-sm"
          placeholder="https://docs.example.com/reference/..."
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          required
        />
        <button className="btn-primary whitespace-nowrap rounded-2xl px-5 py-3 text-sm font-bold" disabled={loading}>
          {loading ? "Validating..." : "Start chat"}
        </button>
      </div>
      {error ? <p className="mt-3 rounded-2xl bg-red-100 px-4 py-3 text-sm text-red-700">{error}</p> : null}
    </form>
  );
}
