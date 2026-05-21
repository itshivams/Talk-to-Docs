import { FormEvent, useState } from "react";
import { useRouter } from "next/router";

import { AuthCard } from "@/components/AuthCard";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard mode="login" error={error} loading={loading} onSubmit={submit}>
      <label className="block text-sm font-bold">
        Email
        <input className="input mt-2 rounded-2xl px-4 py-3" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      </label>
      <label className="block text-sm font-bold">
        Password
        <input className="input mt-2 rounded-2xl px-4 py-3" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
      </label>
    </AuthCard>
  );
}
