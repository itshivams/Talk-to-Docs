import { useEffect, useState } from "react";

import { websocketURL } from "@/lib/api";
import type { ChatSession, Message } from "@/lib/types";

type ChatSnapshot = {
  type: "snapshot";
  session: ChatSession;
  messages: Message[];
};

type StreamState = {
  connected: boolean;
  session: ChatSession | null;
  messages: Message[];
};

export function useChatStream(sessionId: string | null, token: string | null) {
  const [state, setState] = useState<StreamState>({ connected: false, session: null, messages: [] });

  useEffect(() => {
    if (!sessionId || !token) {
      setState({ connected: false, session: null, messages: [] });
      return;
    }

    let closed = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let socket: WebSocket | null = null;

    const connect = () => {
      socket = new WebSocket(websocketURL(`/chat/${sessionId}/stream`, token));

      socket.onopen = () => {
        setState((current) => ({ ...current, connected: true }));
      };

      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data) as ChatSnapshot;
        if (payload.type !== "snapshot") return;
        setState({ connected: true, session: payload.session, messages: payload.messages });
      };

      socket.onclose = () => {
        setState((current) => ({ ...current, connected: false }));
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

  return state;
}
