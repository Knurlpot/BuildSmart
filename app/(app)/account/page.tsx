"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Pencil, Upload, X } from "lucide-react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useFetch } from "@/hooks/useFetch";
import { useMutation } from "@/hooks/useMutation";
import { useAuth } from "@/providers/AuthProvider";
import { USER_ROLES, type Company, type Users } from "@/types/entities";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SpecializationSelect } from "@/components/forms/SpecializationSelect";
import { columnsToSpecializations, formatSpecializations, specializationsToColumns } from "@/lib/specializations";

const EMPTY_COMPANY: Company = {
  company_id: 0,
  company_name: "",
  company_address: "",
  contact_email: "",
  contact_number: "",
  specialization_1: "",
  specialization_2: null,
  specialization_3: null,
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

function normalizeLogoUrl(value?: string | null): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:")
  ) {
    return trimmed;
  }
  return `/${trimmed.replace(/^\/+/, "")}`;
}

function getLogoCandidates(value?: string | null): string[] {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return [];

  const direct = normalizeLogoUrl(trimmed);
  const legacySvgProxy =
    direct.startsWith("/uploads/") && direct.toLowerCase().endsWith(".svg+xml")
      ? `/api/uploads/company-logo/legacy?path=${encodeURIComponent(direct)}`
      : "";
  const fileName = trimmed.split("/").filter(Boolean).pop() ?? "";
  const fallbackFromFileName = fileName ? `/uploads/company-logos/${fileName}` : "";

  return [...new Set([legacySvgProxy, direct, fallbackFromFileName].filter(Boolean))];
}

function LogoImage({
  value,
  alt,
  className,
}: {
  value?: string | null;
  alt: string;
  className: string;
}) {
  const candidates = getLogoCandidates(value);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [value]);

  const src = candidates[index] ?? "";
  if (!src) return null;

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => {
        setIndex((current) => (current + 1 < candidates.length ? current + 1 : current));
      }}
    />
  );
}

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
    <div className="flex flex-col gap-2">
      <dt className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">{label}</dt>
      <dd className="text-sm font-medium text-gray-800">{value && value.trim() ? value : "—"}</dd>
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
        <span>Couldn&apos;t load current values. Showing empty fields. {error.message}</span>
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

function UserProfileSection() {
  const { currentUser } = useAuth();
  const userId = currentUser?.id;
  const companyId = currentUser?.companyId;
  const userEndpoint = userId !== undefined && userId !== null ? `/api/users/${userId}` : null;
  const companyEndpoint =
    companyId !== undefined && companyId !== null ? `/api/company/${companyId}` : null;

  // Fetch user data
  const {
    data: userData,
    isLoading: userLoading,
    error: userError,
    refetch: refetchUser,
  } = useFetch<Users>("/api/auth/me");

  // Fetch company data
  const {
    data: companyData,
    isLoading: companyLoading,
    error: companyError,
    refetch: refetchCompany,
  } = useFetch<Company>(companyEndpoint);

  const updateUser = useMutation<Users>();
  const updateCompany = useMutation<Company>();
  const logoUpload = useMutation<{ url: string }>();

  const [userForm, setUserForm] = useState<Users>(EMPTY_USER);
  const [companyForm, setCompanyForm] = useState<Company>(EMPTY_COMPANY);
  const [syncedUserData, setSyncedUserData] = useState<Users | null>(null);
  const [syncedCompanyData, setSyncedCompanyData] = useState<Company | null>(null);

  if (userData !== syncedUserData) {
    setSyncedUserData(userData);
    if (userData) setUserForm(userData);
  }
  if (companyData !== syncedCompanyData) {
    setSyncedCompanyData(companyData);
    if (companyData) setCompanyForm(companyData);
  }

  const [editing, setEditing] = useState(false);
  const [specializationError, setSpecializationError] = useState("");
  const [logoFileName, setLogoFileName] = useState("");
  const logoInputRef = useRef<HTMLInputElement>(null);

  const uploadLogoFile = async (file: File) => {
    setLogoFileName(file.name);
    const body = new FormData();
    body.append("file", file);
    try {
      const { url } = await logoUpload.mutate("/api/uploads/company-logo", body, "POST");
      setCompanyForm((current) => ({ ...current, company_logo: url }));
    } catch {
      // surfaced via logoUpload.error below
    }
  };

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadLogoFile(file);
  };

  const removeLogo = () => {
    setCompanyForm((current) => ({ ...current, company_logo: "" }));
    setLogoFileName("");
    logoUpload.reset();
  };

  const handleCancel = () => {
    if (userData) setUserForm(userData);
    if (companyData) setCompanyForm(companyData);
    updateUser.reset();
    updateCompany.reset();
    logoUpload.reset();
    setLogoFileName("");
    setSpecializationError("");
    setEditing(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userEndpoint || !companyEndpoint) return;

    if (columnsToSpecializations(companyForm).length === 0) {
      setSpecializationError("At least one specialization is required");
      return;
    }
    setSpecializationError("");

    try {
      // Update user profile
      const userBody: Partial<Users> = { ...userForm };
      delete userBody.user_id;
      const savedUser = await updateUser.mutate(userEndpoint, userBody, "PATCH");
      setUserForm(savedUser);

      // Update company profile
      const companyBody: Partial<Company> = { ...companyForm };
      companyBody.company_logo = normalizeLogoUrl(companyBody.company_logo);
      delete companyBody.company_id;
      const savedCompany = await updateCompany.mutate(companyEndpoint, companyBody, "PATCH");
      setCompanyForm(savedCompany);
      window.dispatchEvent(new Event("company-profile-updated"));

      setEditing(false);
    } catch {
      // surfaced via update.error below — no fabricated success
    }
  };

  const fullName = [userForm.first_name, userForm.middle_name, userForm.last_name]
    .filter((s) => s && s.trim())
    .join(" ");

  const isLoading = userLoading || companyLoading;
  const error = userError || companyError;
  const refetch = () => {
    refetchUser();
    refetchCompany();
  };

  const initials = (companyForm.company_name || "?").slice(0, 2).toUpperCase();
  const specializations = formatSpecializations(columnsToSpecializations(companyForm));

  if (!editing) {
    return (
      <section className="flex flex-col gap-8">
        <LoadErrorBanner isLoading={isLoading} error={error} onRetry={refetch} />

        {/* Header panel */}
        <div className="flex flex-col gap-6 rounded-3xl bg-gradient-to-br from-primary/5 via-white to-gray-50 p-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-5">
            {getLogoCandidates(companyForm.company_logo).length > 0 ? (
              <LogoImage
                value={companyForm.company_logo}
                alt="Company logo"
                className="h-20 w-20 shrink-0 rounded-2xl object-cover shadow-md ring-4 ring-white"
              />
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-white text-xl font-bold text-gray-400 shadow-md ring-4 ring-white">
                {initials}
              </div>
            )}
            <div>
              <p className="text-xl font-bold text-gray-900">{fullName || "—"}</p>
              <p className="mt-0.5 text-sm text-gray-500">{userForm.email || "—"}</p>
            </div>
          </div>
          <EditButton onClick={() => setEditing(true)} />
        </div>

        {/* Details grid */}
        <dl className="grid grid-cols-1 gap-x-8 gap-y-8 px-2 sm:grid-cols-3">
          <ReadOnlyRow label="User Name" value={fullName || undefined} />
          <ReadOnlyRow label="User Email" value={userForm.email} />
          <ReadOnlyRow label="User Role" value={userForm.user_role} />
          <ReadOnlyRow label="Company Name" value={companyForm.company_name} />
          <ReadOnlyRow label="Company Address" value={companyForm.company_address} />
          <ReadOnlyRow label="Company Contact Email" value={companyForm.contact_email} />
          <ReadOnlyRow label="Company Contact Number" value={companyForm.contact_number} />
          <ReadOnlyRow label="Specializations" value={specializations} />
        </dl>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <p className="font-bold text-gray-900">Profile</p>
      </div>
      <LoadErrorBanner isLoading={isLoading} error={error} onRetry={refetch} />

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* User Fields */}
          <div className="mb-4 border-b border-gray-200 pb-4">
            <p className="mb-3 text-sm font-semibold text-gray-700">User Information</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="First Name">
                <input
                  required
                  value={userForm.first_name}
                  onChange={(e) => setUserForm({ ...userForm, first_name: e.target.value })}
                  className={inputCls}
                />
              </Field>
              <Field label="Last Name">
                <input
                  required
                  value={userForm.last_name}
                  onChange={(e) => setUserForm({ ...userForm, last_name: e.target.value })}
                  className={inputCls}
                />
              </Field>
              <Field label="Middle Name">
                <input
                  value={userForm.middle_name ?? ""}
                  onChange={(e) => setUserForm({ ...userForm, middle_name: e.target.value })}
                  className={inputCls}
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  required
                  value={userForm.email}
                  onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                  className={inputCls}
                />
              </Field>
              <Field label="Role">
                <select
                  value={userForm.user_role}
                  onChange={(e) => setUserForm({ ...userForm, user_role: e.target.value as Users["user_role"] })}
                  className={inputCls}
                >
                  {USER_ROLES.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </Field>
            </div>
          </div>

          {/* Company Fields */}
          <div className="mb-4 border-b border-gray-200 pb-4">
            <p className="mb-3 text-sm font-semibold text-gray-700">Company Information</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Company Name">
                <input
                  required
                  value={companyForm.company_name}
                  onChange={(e) => setCompanyForm({ ...companyForm, company_name: e.target.value })}
                  className={inputCls}
                />
              </Field>
              <Field label="Company Address">
                <input
                  required
                  value={companyForm.company_address}
                  onChange={(e) => setCompanyForm({ ...companyForm, company_address: e.target.value })}
                  className={inputCls}
                />
              </Field>
              <Field label="Contact Email">
                <input
                  type="email"
                  required
                  value={companyForm.contact_email}
                  onChange={(e) => setCompanyForm({ ...companyForm, contact_email: e.target.value })}
                  className={inputCls}
                />
              </Field>
              <Field label="Contact Number">
                <input
                  required
                  value={companyForm.contact_number}
                  onChange={(e) => setCompanyForm({ ...companyForm, contact_number: e.target.value })}
                  className={inputCls}
                />
              </Field>
              <div className="sm:col-span-2">
                <SpecializationSelect
                  selected={columnsToSpecializations(companyForm)}
                  onChange={(next) => {
                    setCompanyForm({ ...companyForm, ...specializationsToColumns(next) });
                    if (next.length > 0) setSpecializationError("");
                  }}
                  error={specializationError}
                />
              </div>
              <div className="sm:col-span-2 flex flex-col gap-1.5">
                <span className={labelCls}>Company Logo</span>
                {getLogoCandidates(companyForm.company_logo).length > 0 ? (
                  <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
                    <LogoImage
                      value={companyForm.company_logo}
                      alt="Company logo preview"
                      className="h-10 w-10 shrink-0 rounded-lg border border-gray-200 object-cover"
                    />
                    <span className="flex-1 truncate text-sm text-gray-700">
                      {logoFileName ? `Selected: ${logoFileName}` : "Logo"}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
                      >
                        {logoUpload.isLoading ? "Uploading..." : "Upload Image"}
                      </button>
                      <button
                        type="button"
                        onClick={removeLogo}
                        title="Remove logo"
                        className="shrink-0 text-gray-400 transition hover:text-red-500"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
                  >
                    <Upload className="h-4 w-4" />
                    {logoUpload.isLoading ? "Uploading..." : "Upload Company Logo"}
                  </button>
                )}
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoFileChange}
                  className="hidden"
                />
                {logoUpload.error && (
                  <p className="text-xs text-red-500">Couldn&apos;t upload logo: {logoUpload.error.message}</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={updateUser.isLoading || updateCompany.isLoading || !userEndpoint || !companyEndpoint}
              className={btnCls}
            >
              {updateUser.isLoading || updateCompany.isLoading ? "Saving…" : "Save Profile"}
            </button>
            <button type="button" onClick={handleCancel} className={cancelBtnCls}>
              Cancel
            </button>
            {(updateUser.error || updateCompany.error) && (
              <p className="text-xs text-red-500">
                {updateUser.error?.message || updateCompany.error?.message}
              </p>
            )}
          </div>
        </form>
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
      // surfaced via change.error below — no fabricated success
    }
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-bold text-gray-900">Password</p>
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

const DEACTIVATE_COUNTDOWN_SECONDS = 5;

const DEACTIVATE_SIGNOUT_DELAY_MS = 1800;

function DeactivateAccountDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { logout } = useAuth();
  const router = useRouter();
  const deactivate = useMutation<unknown>();
  const [countdown, setCountdown] = useState(DEACTIVATE_COUNTDOWN_SECONDS);
  const [deactivated, setDeactivated] = useState(false);

  const [syncedOpen, setSyncedOpen] = useState(open);
  if (open !== syncedOpen) {
    setSyncedOpen(open);
    if (open) setCountdown(DEACTIVATE_COUNTDOWN_SECONDS);
  }

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [open]);

  const handleOpenChange = (next: boolean) => {
    if (deactivate.isLoading) return; // no closing mid-request
    onOpenChange(next);
    if (!next) {
      deactivate.reset();
      setDeactivated(false);
    }
  };

  const handleConfirm = async () => {
    try {
          await deactivate.mutate("/api/account/deactivate", {}, "POST");
      setDeactivated(true);
    } catch {
      // surfaced via deactivate.error below — no fabricated success
    }
  };

  const confirmDisabled = countdown > 0 || deactivate.isLoading;

    useEffect(() => {
    if (!deactivated) return;
    const t = setTimeout(() => {
      logout().finally(() => router.push("/login"));
    }, DEACTIVATE_SIGNOUT_DELAY_MS);
    return () => clearTimeout(t);
  }, [deactivated, logout, router]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete your account?</DialogTitle>
          <DialogDescription>
            This will permanently delete your account and all associated data. This action cannot be undone.
          </DialogDescription>
          <DialogDescription className="mt-1 text-xs text-gray-400">
            You will be signed out after confirming.
          </DialogDescription>
        </DialogHeader>

        {deactivated ? (
          <p className="text-sm text-green-700">
            Your account has been deactivated. Signing you out…
          </p>
        ) : (
          <>
            {deactivate.error && (
              <p className="flex items-start gap-1.5 text-xs text-red-600">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Couldn&apos;t deactivate your account: {deactivate.error.message}
              </p>
            )}
            <DialogFooter>
              <button
                type="button"
                disabled={confirmDisabled}
                onClick={handleConfirm}
                className={`w-full rounded-xl px-5 py-2.5 text-sm font-bold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-75 sm:w-fit ${
                  confirmDisabled ? "bg-red-400 text-black" : "bg-red-600 text-black hover:bg-red-700"
                }`}
              >
                {deactivate.isLoading ? "Deleting…" : confirmDisabled && countdown > 0 ? `Delete Account (${countdown})` : "Yes, Delete Account"}
              </button>
              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                className={`${cancelBtnCls} w-full sm:w-fit`}
              >
                No, keep my account
              </button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Delete Account Section
function DeactivateAccountSection() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <section className="flex items-center justify-between rounded-2xl border border-red-200 bg-red-50/50 p-6">
      <p className="font-bold text-red-900">Delete Account</p>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className="w-fit rounded-xl border border-red-300 bg-white px-4 py-2.5 text-sm font-bold text-red-600 transition hover:bg-red-100"
      >
        Delete Account
      </button>

      <DeactivateAccountDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </section>
  );
}

export default function AccountPage() {
  return (
    <RequireAuth>
      <div className="flex flex-col gap-8">
        <UserProfileSection />
        <PasswordSection />
        <DeactivateAccountSection />
      </div>
    </RequireAuth>
  );
}
