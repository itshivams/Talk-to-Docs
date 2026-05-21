import Link from "next/link";
import { FormEvent, ReactNode } from "react";

type AuthCardProps = {
  mode: "login" | "register";
  error: string;
  loading: boolean;
  children: ReactNode;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function AuthCard({ mode, error, loading, children, onSubmit }: AuthCardProps) {
  const isLogin = mode === "login";
  return (
    <main className="grain flex min-h-screen items-center justify-center px-5 py-10">
      <section className="panel fade-in grid w-full max-w-5xl overflow-hidden rounded-[2rem] md:grid-cols-[1.1fr_0.9fr]">
        <div className="relative min-h-[420px] bg-[var(--charcoal)] p-8 text-[var(--paper)] md:p-12">
          <div className="absolute inset-0 opacity-35 [background:radial-gradient(circle_at_25%_20%,#c45f3a,transparent_32%),radial-gradient(circle_at_80%_10%,#e5d2ad,transparent_26%)]" />
          <div className="relative flex h-full flex-col justify-between">
            <div>
              <p className="mb-6 inline-flex rounded-full border border-white/20 px-3 py-1 text-xs uppercase tracking-[0.28em] text-white/70">
                Talk to Docs
              </p>
              <h1 className="max-w-md text-5xl font-black leading-[0.95] tracking-[-0.05em] md:text-6xl">
                Answers fenced to one source.
              </h1>
            </div>
            <p className="max-w-sm text-sm leading-6 text-white/70">
              Every chat is bound to exactly one documentation URL. Retrieval is scoped by user, session, and document ID before the model sees context.
            </p>
          </div>
        </div>
        <div className="p-7 md:p-10">
          <h2 className="text-3xl font-black tracking-[-0.04em]">{isLogin ? "Sign in" : "Create account"}</h2>
          <p className="mt-2 text-sm text-black/60">
            {isLogin ? "Continue to your documentation workbench." : "Start a scoped documentation chat workspace."}
          </p>
          <form className="mt-8 space-y-4" onSubmit={onSubmit}>
            {children}
            {error ? <p className="rounded-2xl bg-red-100 px-4 py-3 text-sm text-red-700">{error}</p> : null}
            <button className="btn-primary w-full rounded-2xl px-5 py-3 text-sm font-bold" disabled={loading}>
              {loading ? "Working..." : isLogin ? "Login" : "Register"}
            </button>
          </form>
          <p className="mt-6 text-sm text-black/60">
            {isLogin ? "No account?" : "Already registered?"}{" "}
            <Link className="font-bold text-[var(--clay)]" href={isLogin ? "/register" : "/login"}>
              {isLogin ? "Create one" : "Login"}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
