"use client";

// Assumed endpoints — ALL UNVERIFIED, confirm with the backend team:
//   GET   /api/auth/me              (user profile fields)
//   GET   /api/company/:id
//   PATCH /api/company/:id
//   PATCH /api/users/:id
//   POST  /api/auth/change-password  ⚠️ AUTH-BOUNDARY endpoint — owned by the backend
//         team (hashing, current-password verification, session invalidation). This
//         file only builds the form and calls it; it never stores, forwards, or logs
//         a password anywhere else.
//
// NOTE: lib/api/auth.ts already calls GET /api/auth/me from AuthProvider, but types its
// response as the minimal AuthUser shape (id/email/companyId/onboardingStep) — that's
// all the auth/onboarding gate needs. This page assumes the SAME endpoint also returns
// the fuller Users fields (first_name, last_name, user_role, status) needed for the
// profile form. That assumption may be wrong — a dedicated GET /api/users/:id might be
// the real contract. Confirm with backend before trusting either shape.
import { useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useFetch } from "@/hooks/useFetch";
import { useMutation } from "@/hooks/useMutation";
import { useAuth } from "@/providers/AuthProvider";
import type { Company, Users } from "@/types/entities";

const USER_ROLES: Users["user_role"][] = ["Owner", "Admin", "Estimator", "Viewer"];
const STATUSES: Company["status"][] = ["Active", "Inactive"];

const EMPTY_COMPANY: Company = {
  company_id: 0,
  company_name: "",
  company_address: "",
  contact_email: "",
  contact_number: "",
  specialization_1: "",
  specialization_2: "",
  specialization_3: "",
  company_logo: "",
  status: "Active",
  created_at: "",
};

const EMPTY_USER: Users = {
  user_id: 0,
  company_id: 0,
  last_name: "",
  first_name: "",
  middle_name: "",
  email: "",
  user_role: "Estimator",
  status: "Active",
  created_at: "",
};

const inputCls =
  "rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20";
const labelCls = "text-xs font-semibold uppercase tracking-wide text-gray-600";
const btnCls =
  "w-fit rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:opacity-60";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={labelCls}>{label}</span>
      {children}
    </label>
  );
}

function LoadErrorBanner({
  isLoading,
  error,
  onRetry,
}: {
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  if (isLoading) {
    return <p className="mb-4 text-xs text-gray-400">Loading current values…</p>;
  }
  if (error) {
    return (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        <span>Couldn&apos;t load current values — showing empty fields. {error.message}</span>
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-lg border border-red-200 bg-white px-3 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50"
        >
          Retry
        </button>
      </div>
    );
  }
  return null;
}

function CompanySection() {
  const { currentUser } = useAuth();
  const companyId = currentUser?.companyId;
  const endpoint =
    companyId !== undefined && companyId !== null ? `/api/company/${companyId}` : null;

  const { data, isLoading, error, refetch } = useFetch<Company>(endpoint);
  const update = useMutation<Company>();

  // Adjust form state from freshly-fetched data during render (React's documented
  // pattern for this) rather than in a useEffect. Form always has a value — either
  // the real fetched record or the empty defaults — so fields never disappear.
  const [form, setForm] = useState<Company>(EMPTY_COMPANY);
  const [syncedData, setSyncedData] = useState<Company | null>(null);
  if (data !== syncedData) {
    setSyncedData(data);
    if (data) setForm(data);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!endpoint) return;
    // company_id lives in the URL, not the body — never send an id back, invented or not.
    const body: Partial<Company> = { ...form };
    delete body.company_id;
    try {
      const saved = await update.mutate(endpoint, body, "PATCH");
      setForm(saved);
    } catch {
      // surfaced via update.error below — no fabricated success
    }
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <p className="mb-4 font-bold text-gray-900">Company Profile</p>
      <LoadErrorBanner isLoading={isLoading} error={error} onRetry={refetch} />

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Company Name">
            <input
              required
              value={form.company_name}
              onChange={(e) => setForm({ ...form, company_name: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Company Address">
            <input
              required
              value={form.company_address}
              onChange={(e) => setForm({ ...form, company_address: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Contact Email">
            <input
              type="email"
              required
              value={form.contact_email}
              onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Contact Number">
            <input
              required
              value={form.contact_number}
              onChange={(e) => setForm({ ...form, contact_number: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Specialization 1">
            <input
              required
              value={form.specialization_1}
              onChange={(e) => setForm({ ...form, specialization_1: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Specialization 2">
            <input
              value={form.specialization_2 ?? ""}
              onChange={(e) => setForm({ ...form, specialization_2: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Specialization 3">
            <input
              value={form.specialization_3 ?? ""}
              onChange={(e) => setForm({ ...form, specialization_3: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Status">
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as Company["status"] })}
              className={inputCls}
            >
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Company Logo (URL)">
            <input
              value={form.company_logo ?? ""}
              onChange={(e) => setForm({ ...form, company_logo: e.target.value })}
              placeholder="https://…"
              className={inputCls}
            />
          </Field>
        </div>
        {form.company_logo && (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary external URL, not a static asset
          <img
            src={form.company_logo}
            alt="Company logo preview"
            className="h-14 w-14 rounded-xl border border-gray-200 object-cover"
          />
        )}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={update.isLoading || !endpoint} className={btnCls}>
            {update.isLoading ? "Saving…" : "Save Company Profile"}
          </button>
          {update.error && <p className="text-xs text-red-500">{update.error.message}</p>}
          {update.data && !update.error && !update.isLoading && (
            <p className="text-xs text-green-600">Saved.</p>
          )}
        </div>
      </form>
    </section>
  );
}

function UserSection() {
  const { currentUser } = useAuth();
  const userId = currentUser?.id;
  const endpoint = userId !== undefined && userId !== null ? `/api/users/${userId}` : null;

  const { data, isLoading, error, refetch } = useFetch<Users>("/api/auth/me");
  const update = useMutation<Users>();

  const [form, setForm] = useState<Users>(EMPTY_USER);
  const [syncedData, setSyncedData] = useState<Users | null>(null);
  if (data !== syncedData) {
    setSyncedData(data);
    if (data) setForm(data);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!endpoint) return;
    // user_id lives in the URL (from the authenticated session, never form state) —
    // strip it from the body so an invented/placeholder id is never sent.
    const body: Partial<Users> = { ...form };
    delete body.user_id;
    try {
      const saved = await update.mutate(endpoint, body, "PATCH");
      setForm(saved);
    } catch {
      // surfaced via update.error below — no fabricated success
    }
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <p className="mb-4 font-bold text-gray-900">User Profile</p>
      <LoadErrorBanner isLoading={isLoading} error={error} onRetry={refetch} />

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="First Name">
            <input
              required
              value={form.first_name}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Last Name">
            <input
              required
              value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Middle Name">
            <input
              value={form.middle_name ?? ""}
              onChange={(e) => setForm({ ...form, middle_name: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Role">
            <select
              value={form.user_role}
              onChange={(e) => setForm({ ...form, user_role: e.target.value as Users["user_role"] })}
              className={inputCls}
            >
              {USER_ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as Users["status"] })}
              className={inputCls}
            >
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={update.isLoading || !endpoint} className={btnCls}>
            {update.isLoading ? "Saving…" : "Save User Profile"}
          </button>
          {update.error && <p className="text-xs text-red-500">{update.error.message}</p>}
          {update.data && !update.error && !update.isLoading && (
            <p className="text-xs text-green-600">Saved.</p>
          )}
        </div>
      </form>
    </section>
  );
}

function PasswordSection() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [validationError, setValidationError] = useState("");
  const [justChanged, setJustChanged] = useState(false);
  const change = useMutation<unknown>();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError("");
    setJustChanged(false);
    if (newPassword.length < 6) {
      setValidationError("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setValidationError("New password and confirmation do not match.");
      return;
    }
    try {
      await change.mutate(
        "/api/auth/change-password",
        { currentPassword, newPassword },
        "POST"
      );
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setJustChanged(true);
    } catch {
      // surfaced via change.error below — no fabricated success
    }
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <p className="font-bold text-gray-900">Change Password</p>
      <p className="mb-4 text-xs text-gray-400">
        Handled entirely by the auth backend — never stored, forwarded, or logged here.
      </p>
      <form onSubmit={handleSubmit} className="flex max-w-md flex-col gap-4">
        <Field label="Current Password">
          <input
            type="password"
            required
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => {
              setCurrentPassword(e.target.value);
              setJustChanged(false);
            }}
            className={inputCls}
          />
        </Field>
        <Field label="New Password">
          <input
            type="password"
            required
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              setJustChanged(false);
            }}
            className={inputCls}
          />
        </Field>
        <Field label="Confirm New Password">
          <input
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              setJustChanged(false);
            }}
            className={inputCls}
          />
        </Field>
        {validationError && <p className="text-xs text-red-500">{validationError}</p>}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={change.isLoading} className={btnCls}>
            {change.isLoading ? "Updating…" : "Change Password"}
          </button>
          {change.error && <p className="text-xs text-red-500">{change.error.message}</p>}
          {justChanged && !change.error && !change.isLoading && (
            <p className="text-xs text-green-600">Password updated.</p>
          )}
        </div>
      </form>
    </section>
  );
}

export default function AccountPage() {
  return (
    <RequireAuth>
      <div className="flex flex-col gap-5">
        <CompanySection />
        <UserSection />
        <PasswordSection />
      </div>
    </RequireAuth>
  );
}
