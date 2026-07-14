"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useFetch } from "@/hooks/useFetch";
import { useMutation } from "@/hooks/useMutation";
import { useAuth } from "@/providers/AuthProvider";
import { USER_ROLES, type Company, type Users } from "@/types/entities";

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
const cancelBtnCls =
  "w-fit rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-bold text-gray-600 transition hover:bg-gray-50";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={labelCls}>{label}</span>
      {children}
    </label>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="text-sm text-gray-800">{value && value.trim() ? value : "—"}</dd>
    </div>
  );
}

function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:border-primary hover:text-primary"
    >
      <Pencil className="h-3.5 w-3.5" /> Edit
    </button>
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

  const [form, setForm] = useState<Company>(EMPTY_COMPANY);
  const [syncedData, setSyncedData] = useState<Company | null>(null);
  if (data !== syncedData) {
    setSyncedData(data);
    if (data) setForm(data);
  }
  
  const [editing, setEditing] = useState(false);

  const handleCancel = () => {
    if (data) setForm(data);
    update.reset();
    setEditing(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!endpoint) return;
    const body: Partial<Company> = { ...form };
    delete body.company_id;
    try {
      const saved = await update.mutate(endpoint, body, "PATCH");
      setForm(saved);
      setEditing(false);
    } catch {
    }
  };

  const initials = (form.company_name || "?").slice(0, 2).toUpperCase();

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <p className="font-bold text-gray-900">Company Profile</p>
        {!editing && <EditButton onClick={() => setEditing(true)} />}
      </div>
      <LoadErrorBanner isLoading={isLoading} error={error} onRetry={refetch} />

      {!editing ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            {form.company_logo ? (
              <img
                src={form.company_logo}
                alt="Company logo"
                className="h-14 w-14 shrink-0 rounded-xl border border-gray-200 object-cover"
              />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-sm font-bold text-gray-400">
                {initials}
              </div>
            )}
            <div>
              <p className="text-lg font-bold text-gray-900">{form.company_name || "—"}</p>
              <p className="text-sm text-gray-500">{form.company_address || "—"}</p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <ReadOnlyRow label="Contact Email" value={form.contact_email} />
            <ReadOnlyRow label="Contact Number" value={form.contact_number} />
            <ReadOnlyRow label="Specialization 1" value={form.specialization_1} />
            <ReadOnlyRow label="Specialization 2" value={form.specialization_2} />
            <ReadOnlyRow label="Specialization 3" value={form.specialization_3} />
            <ReadOnlyRow label="Status" value={form.status} />
          </dl>
        </div>
      ) : (
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
            <button type="button" onClick={handleCancel} className={cancelBtnCls}>
              Cancel
            </button>
            {update.error && <p className="text-xs text-red-500">{update.error.message}</p>}
          </div>
        </form>
      )}
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

  const [editing, setEditing] = useState(false);

  const handleCancel = () => {
    if (data) setForm(data);
    update.reset();
    setEditing(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!endpoint) return;
    const body: Partial<Users> = { ...form };
    delete body.user_id;
    try {
      const saved = await update.mutate(endpoint, body, "PATCH");
      setForm(saved);
      setEditing(false);
    } catch {
    }
  };

  const fullName = [form.first_name, form.middle_name, form.last_name].filter((s) => s && s.trim()).join(" ");

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <p className="font-bold text-gray-900">User Profile</p>
        {!editing && <EditButton onClick={() => setEditing(true)} />}
      </div>
      <LoadErrorBanner isLoading={isLoading} error={error} onRetry={refetch} />

      {!editing ? (
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-lg font-bold text-gray-900">{fullName || "—"}</p>
            <p className="text-sm text-gray-500">{form.email || "—"}</p>
          </div>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <ReadOnlyRow label="Role" value={form.user_role} />
            <ReadOnlyRow label="Status" value={form.status} />
          </dl>
        </div>
      ) : (
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
            <button type="button" onClick={handleCancel} className={cancelBtnCls}>
              Cancel
            </button>
            {update.error && <p className="text-xs text-red-500">{update.error.message}</p>}
          </div>
        </form>
      )}
    </section>
  );
}

function PasswordSection() {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [validationError, setValidationError] = useState("");
  const [justChanged, setJustChanged] = useState(false);
  const change = useMutation<unknown>();

  const resetFields = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setValidationError("");
    setJustChanged(false);
  };

  const handleCancel = () => {
    resetFields();
    change.reset();
    setOpen(false);
  };

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
    }
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-bold text-gray-900">Password</p>
          <p className="text-xs text-gray-400">
            Handled entirely by the auth backend — never stored, forwarded, or logged here.
          </p>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:border-primary hover:text-primary"
          >
            Change Password
          </button>
        )}
      </div>

      {open && (
        <form onSubmit={handleSubmit} className="mt-4 flex max-w-md flex-col gap-4">
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
            <button type="button" onClick={handleCancel} className={cancelBtnCls}>
              Cancel
            </button>
            {change.error && <p className="text-xs text-red-500">{change.error.message}</p>}
            {justChanged && !change.error && !change.isLoading && (
              <p className="text-xs text-green-600">Password updated.</p>
            )}
          </div>
        </form>
      )}
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