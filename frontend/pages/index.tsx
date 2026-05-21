import { useRouter } from "next/router";
import { useEffect } from "react";

import { useAuth } from "@/lib/auth";

export default function Home() {
  const router = useRouter();
  const { token, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    router.replace(token ? "/dashboard" : "/login");
  }, [loading, router, token]);

  return (
    <main className="grain flex min-h-screen items-center justify-center">
      <p className="rounded-full border border-black/10 bg-white/50 px-5 py-3 text-sm text-black/60">Loading Talk to Docs...</p>
    </main>
  );
}
