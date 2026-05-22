import { useCallback, useEffect, useRef, useState } from "react";

import { websocketURL } from "@/lib/api";
import type { AnswerMode, ChatSession, Message, SourceReference } from "@/lib/types";

type ChatSnapshot = {
  type: "snapshot";
  session: ChatSession;
  messages: Message[];
  suggestions: string[];
};

type StreamState = {
  connected: boolean;
  streaming: boolean;
  session: ChatSession | null;
  messages: Message[];
  suggestions: string[];
  error: string;
};

export function useChatStream(sessionId: string | null, token: string | null) {
  const socketRef = useRef<WebSocket | null>(null);
  const [state, setState] = useState<StreamState>({ connected: false, streaming: false, session: null, messages: [], suggestions: [], error: "" });

  useEffect(() => {
    if (!sessionId || !token) {
      return;
    }

    let closed = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let socket: WebSocket | null = null;

    const connect = () => {
      socket = new WebSocket(websocketURL(`/chat/${sessionId}/stream`, token));
      socketRef.current = socket;

      socket.onopen = () => {
        setState((current) => ({ ...current, connected: true }));
      };

      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data) as
          | ChatSnapshot
          | { type: "answer_start"; question: string; sources: SourceReference[] }
          | { type: "answer_delta"; delta: string }
          | { type: "answer_done"; answer: string; sources: SourceReference[] }
          | { type: "error"; message: string };
        if (payload.type === "snapshot") {
          setState((current) => ({
            ...current,
            connected: true,
            session: payload.session,
            messages: current.streaming ? current.messages : payload.messages,
            suggestions: payload.suggestions,
          }));
        }
        if (payload.type === "answer_start") {
          const createdAt = new Date().toISOString();
          setState((current) => ({
            ...current,
            error: "",
            streaming: true,
            messages: [
              ...current.messages,
              { id: `ask-${createdAt}`, session_id: sessionId, role: "user", content: payload.question, sources: [], created_at: createdAt },
              { id: `stream-${createdAt}`, session_id: sessionId, role: "assistant", content: "", sources: payload.sources, created_at: createdAt },
            ],
          }));
        }
        if (payload.type === "answer_delta") {
          setState((current) => ({
            ...current,
            messages: current.messages.map((message, index) =>
              index === current.messages.length - 1 && message.role === "assistant" ? { ...message, content: `${message.content}${payload.delta}` } : message,
            ),
          }));
        }
        if (payload.type === "answer_done") {
          setState((current) => ({
            ...current,
            streaming: false,
            messages: current.messages.map((message, index) =>
              index === current.messages.length - 1 && message.role === "assistant" ? { ...message, content: payload.answer, sources: payload.sources } : message,
            ),
          }));
        }
        if (payload.type === "error") {
          setState((current) => ({ ...current, streaming: false, error: payload.message }));
        }
      };

      socket.onclose = () => {
        socketRef.current = null;
        setState((current) => ({ ...current, connected: false, streaming: false }));
        if (!closed) {
          retry = setTimeout(connect, 1500);
        }
      };

      socket.onerror = () => {
        socket?.close();
      };
    };

    connect();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      socket?.close();
    };
  }, [sessionId, token]);

  const ask = useCallback((question: string, mode: AnswerMode) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setState((current) => ({ ...current, error: "Realtime chat is reconnecting. Try again in a moment." }));
      return false;
    }
    socket.send(JSON.stringify({ type: "ask", question, mode }));
    return true;
  }, []);

  const currentSessionState =
    state.session?.id === sessionId
      ? state
      : { connected: false, streaming: false, session: null, messages: [], suggestions: [], error: "" };
  return { ...currentSessionState, ask };
}
