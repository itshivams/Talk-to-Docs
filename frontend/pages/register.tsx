import { FormEvent, useState } from "react";
import { useRouter } from "next/router";

import { AuthCard } from "@/components/AuthCard";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(name, email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard mode="register" error={error} loading={loading} onSubmit={submit}>
      <label className="block text-sm font-bold">
        Name
        <input className="input mt-2 rounded-lg px-4 py-3" value={name} onChange={(event) => setName(event.target.value)} required />
      </label>
      <label className="block text-sm font-bold">
        Email
        <input className="input mt-2 rounded-lg px-4 py-3" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      </label>
      <label className="block text-sm font-bold">
        Password
        <input className="input mt-2 rounded-lg px-4 py-3" type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required />
      </label>
    </AuthCard>
  );
}
