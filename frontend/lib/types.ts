export type User = {
  id: string;
  name: string;
  email: string;
  created_at: string;
};

export type ChatSession = {
  id: string;
  user_id: string;
  doc_id: string;
  source_url: string;
  title: string;
  status: "queued" | "processing" | "ready" | "error";
  created_at: string;
  updated_at: string;
};

export type SourceReference = {
  doc_id: string;
  session_id: string;
  source_url: string;
  title: string;
  chunk_index: number;
  heading?: string;
  excerpt: string;
};

export type Message = {
  id?: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  sources: SourceReference[];
  created_at?: string;
};
