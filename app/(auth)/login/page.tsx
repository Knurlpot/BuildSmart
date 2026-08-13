"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Eye, EyeOff, AlertCircle, Lock } from "lucide-react";
import { AuthBrandPanel } from "@/components/auth/AuthBrandPanel";
import { logoFrame } from "@/components/logo-frames";
import { useAuth } from "@/providers/AuthProvider";
import { resolveOnboardingRoute } from "@/lib/onboarding";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [isLocked, setIsLocked] = useState(false);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    setIsLocked(false);
    setAttemptsRemaining(null);

    try {
      const user = await login(email, password);
      router.push(resolveOnboardingRoute(user.onboardingStep));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unable to sign in. Please check your credentials or try again.";
      setError(errorMessage);

      // Check if this is a lock error
      if (errorMessage.includes("Account is temporarily locked") || errorMessage.includes("Account is locked")) {
        setIsLocked(true);
      } else if (errorMessage.includes("attempt")) {
        // Extract attempts remaining from error message if present
        const match = errorMessage.match(/(\d+)\s+attempt/);
        if (match) {
          setAttemptsRemaining(parseInt(match[1]));
        }
      }

      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <AuthBrandPanel
        frame={13}
        subtitle="Construction Estimating Platform"
        footer={
          <div className="flex gap-8 text-xs font-medium text-white/50">
            <span>Smart Estimation</span>
            <span>·</span>
            <span>Market Intelligence</span>
            <span>·</span>
            <span>Supplier Insights</span>
          </div>
        }
      />

      <div className="flex flex-1 flex-col items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <Image src={logoFrame(13)} alt="" className="h-8 w-8" />
            <span className="text-lg font-bold text-gray-900">BuildSmart</span>
          </div>

          <div className="mb-4">
            <h2 className="text-2xl font-extrabold tracking-tight text-gray-900">
              Welcome back
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Login to your BuildSmart account!
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {error && (
              <div className={`flex gap-3 rounded-xl border px-4 py-3 text-sm ${
                isLocked 
                  ? "border-orange-200 bg-orange-50 text-orange-700" 
                  : attemptsRemaining !== null
                    ? "border-yellow-200 bg-yellow-50 text-yellow-700"
                    : "border-red-200 bg-red-50 text-red-700"
              }`}>
                {isLocked ? (
                  <Lock className="h-5 w-5 flex-shrink-0" />
                ) : (
                  <AlertCircle className="h-5 w-5 flex-shrink-0" />
                )}
                <div>
                  {error}
                  {attemptsRemaining !== null && attemptsRemaining > 0 && (
                    <p className="mt-1 text-xs font-medium opacity-80">
                      After all attempts are used, your account will be locked for 30 minutes.
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="group relative">
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder=" "
                required
                autoFocus
                disabled={isLocked}
                className="peer w-full rounded-xl border border-gray-200 bg-gray-50 px-4 pb-2.5 pt-5 text-sm outline-none transition disabled:bg-gray-100 disabled:text-gray-400 focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
              />
              <label
                htmlFor="login-email"
                className="pointer-events-none absolute left-4 top-2 text-[10px] font-semibold text-gray-500 transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-placeholder-shown:font-medium peer-focus:top-2 peer-focus:translate-y-0 peer-focus:text-[10px] peer-focus:font-semibold peer-focus:text-primary"
              >
                Email
              </label>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder=" "
                  required
                  disabled={isLocked}
                  className="peer w-full rounded-xl border border-gray-200 bg-gray-50 px-4 pb-2.5 pt-5 pr-11 text-sm outline-none transition disabled:bg-gray-100 disabled:text-gray-400 focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20"
                />
                <label
                  htmlFor="login-password"
                  className="pointer-events-none absolute left-4 top-2 text-[10px] font-semibold text-gray-500 transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-placeholder-shown:font-medium peer-focus:top-2 peer-focus:translate-y-0 peer-focus:text-[10px] peer-focus:font-semibold peer-focus:text-primary"
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  disabled={isLocked}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 disabled:text-gray-300"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="remember"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                disabled={isLocked}
                className="h-4 w-4 rounded border-gray-300 accent-primary disabled:bg-gray-100"
              />
              <label
                htmlFor="remember"
                className={`cursor-pointer select-none text-sm ${isLocked ? "text-gray-400" : "text-gray-600"}`}
              >
                Remember Me
              </label>
            </div>

            <button
              type="submit"
              disabled={loading || isLocked}
              className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:opacity-60"
            >
              {loading && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              )}
              {isLocked ? "Account Locked" : loading ? "Signing in…" : "Log In"}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-gray-500">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="font-semibold text-primary hover:underline">
              Create one →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
