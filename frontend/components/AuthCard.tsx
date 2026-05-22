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
    <main className="grain flex min-h-screen items-center justify-center px-4 py-8">
      <section className="fade-in grid w-full max-w-5xl overflow-hidden rounded-lg border border-[var(--line)] bg-white shadow-sm md:grid-cols-[1fr_420px]">
        <div className="flex min-h-[340px] flex-col justify-between border-b border-[var(--line)] bg-black p-8 text-white md:border-b-0 md:border-r md:p-10">
          <div>
            <p className="mb-6 text-xs font-semibold uppercase text-white/60">Talk to Docs</p>
            <h1 className="max-w-md text-4xl font-semibold leading-tight md:text-5xl">Chat with one source at a time.</h1>
          </div>
          <p className="mt-10 max-w-md text-sm leading-6 text-white/70">
            Ask questions against a single documentation URL. Answers stay scoped to the session source and include references.
          </p>
        </div>
        <div className="p-6 md:p-8">
          <h2 className="text-2xl font-semibold">{isLogin ? "Sign in" : "Create account"}</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {isLogin ? "Continue to your documentation workbench." : "Start a scoped documentation chat workspace."}
          </p>
          <form className="mt-8 space-y-4" onSubmit={onSubmit}>
            {children}
            {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
            <button className="btn-primary w-full rounded-lg px-5 py-3 text-sm font-semibold" disabled={loading}>
              {loading ? "Working..." : isLogin ? "Sign in" : "Create account"}
            </button>
          </form>
          <p className="mt-6 text-sm text-[var(--muted)]">
            {isLogin ? "No account?" : "Already registered?"}{" "}
            <Link className="font-semibold text-black underline underline-offset-4" href={isLogin ? "/register" : "/login"}>
              {isLogin ? "Create one" : "Sign in"}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
