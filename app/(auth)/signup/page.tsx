"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Link as LinkIcon,
  Plus,
  Upload,
  X,
} from "lucide-react";
import { AuthBrandPanel } from "@/components/auth/AuthBrandPanel";
import { TermsModal } from "@/components/auth/TermsModal";
import { useAuth } from "@/providers/AuthProvider";
import { useMutation } from "@/hooks/useMutation";
import { resolveOnboardingRoute } from "@/lib/onboarding";
import { USER_ROLES, type Users } from "@/types/entities";

// Schema v3 VARCHAR lengths — enforced as maxLength on the matching inputs below.
const MAX = {
  firstName: 30,
  lastName: 30,
  middleName: 30,
  companyName: 75,
  companyAddress: 255,
  companyContactEmail: 100,
  specialization: 50,
  companyLogo: 255,
  email: 100,
} as const;

const PASSWORD_MIN_LENGTH = 8;

type Step = 1 | 2;

interface FormData {
  // Step 1 -> users
  firstName: string;
  lastName: string;
  middleName: string;
  userRole: Users["user_role"];
  email: string;
  password: string;
  confirmPassword: string;
  // Step 2 -> company
  companyName: string;
  companyAddress: string;
  companyContactEmail: string;
  // PH mobile national number, digits only (no "+63", no spaces, max 10) — see
  // formatPhNationalNumber/formatPhDisplayNumber below for how this is rendered/submitted.
  companyContactNumber: string;
  specialization1: string;
  specialization2: string;
  specialization3: string;
  companyLogo: string;
}

const INIT: FormData = {
  firstName: "",
  lastName: "",
  middleName: "",
  userRole: "Owner",
  email: "",
  password: "",
  confirmPassword: "",
  companyName: "",
  companyAddress: "",
  companyContactEmail: "",
  companyContactNumber: "",
  specialization1: "",
  specialization2: "",
  specialization3: "",
  companyLogo: "",
};

function isValidEmail(v: string) {
  return v.includes("@") && v.includes(".");
}

const PH_NATIONAL_NUMBER_LENGTH = 10;

// Strips everything but digits, then unwraps a redundant country code or trunk-prefix 0
// if present — lets a pasted "+63 917 123 4567" or "0917 123 4567" still land on the
// right 10-digit national number instead of getting truncated from the wrong end.
function normalizePhDigits(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("63") && d.length > PH_NATIONAL_NUMBER_LENGTH) d = d.slice(2);
  else if (d.startsWith("0") && d.length > PH_NATIONAL_NUMBER_LENGTH) d = d.slice(1);
  return d.slice(0, PH_NATIONAL_NUMBER_LENGTH);
}

// "9171234567" -> "917 123 4567". Grouping is capped at 10 digits by normalizePhDigits
// before this ever runs, so the 3-3-4 spacing can never overflow/collapse.
function formatPhNationalNumber(digits: string): string {
  return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 10)].filter(Boolean).join(" ");
}

// "9171234567" -> "+63 917 123 4567", for the submitted payload.
function formatPhDisplayNumber(digits: string): string {
  const national = formatPhNationalNumber(digits);
  return national ? `+63 ${national}` : "";
}

// 14 checks (13 fields + terms acceptance) map onto the 14 logo frames (0-13).
// Scaled rather than counted 1:1, so the cube only reaches the fully-filled
// frame once every check — including agreeing to the Terms — is true.
const TOTAL_FIELD_CHECKS = 14;

function countValidFields(d: FormData, termsAccepted: boolean): number {
  const checks = [
    d.firstName.trim().length > 0,
    d.lastName.trim().length > 0,
    d.middleName.trim().length > 0,
    isValidEmail(d.email),
    d.password.length >= PASSWORD_MIN_LENGTH && d.password === d.confirmPassword,
    d.companyName.trim().length > 0,
    d.companyAddress.trim().length > 0,
    isValidEmail(d.companyContactEmail),
    d.companyContactNumber.length === PH_NATIONAL_NUMBER_LENGTH,
    d.specialization1.trim().length > 0,
    d.specialization2.trim().length > 0,
    d.specialization3.trim().length > 0,
    d.companyLogo.trim().length > 0,
    termsAccepted,
  ];
  return checks.filter(Boolean).length;
}

function fieldCountToFrame(count: number): number {
  return Math.min(13, Math.round((count / TOTAL_FIELD_CHECKS) * 13));
}

function ProgressBar({ step }: { step: Step }) {
  const steps: { n: Step; label: string }[] = [
    { n: 1, label: "Your Account" },
    { n: 2, label: "Company Details" },
  ];
  return (
    <div className="flex items-center gap-2">
      {steps.map(({ n, label }, i) => (
        <div key={n} className="flex items-center gap-2">
          <div className="flex flex-col items-center gap-1">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition ${
                n < step
                  ? "bg-primary text-primary-foreground"
                  : n === step
                    ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                    : "bg-gray-100 text-gray-400"
              }`}
            >
              {n < step ? <Check className="h-3.5 w-3.5" /> : n}
            </div>
            <span
              className={`whitespace-nowrap text-[10px] font-semibold ${
                n === step ? "text-primary" : "text-gray-400"
              }`}
            >
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={`mb-3 h-0.5 w-10 rounded transition ${
                n < step ? "bg-primary" : "bg-gray-100"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export default function SignUpPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormData>(INIT);
  const [showPw, setShowPw] = useState(false);
  const [showCPw, setShowCPw] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  // Progressive disclosure for the optional specialization_2/3 columns — schema has exactly
  // three slots, specialization_1 required, 2 and 3 nullable. Only the LAST visible optional
  // field is ever removable: removal always happens from the tail, so a gap (e.g. clearing
  // specialization_2 while specialization_3 still holds a value) can never occur — simpler
  // than shifting values up, and just as correct.
  const [specializationCount, setSpecializationCount] = useState<1 | 2 | 3>(1);

  // The contact-number input is fully reformatted (spaces inserted/removed) on every
  // keystroke, which resets the browser's cursor unless we put it back ourselves —
  // otherwise editing anywhere but the very end scrambles the digit order.
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const pendingPhoneCursorRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (pendingPhoneCursorRef.current !== null && phoneInputRef.current) {
      phoneInputRef.current.setSelectionRange(pendingPhoneCursorRef.current, pendingPhoneCursorRef.current);
      pendingPhoneCursorRef.current = null;
    }
  });

  // Assumed endpoint — UNVERIFIED, confirm with the backend team:
  //   POST /api/uploads/company-logo (multipart FormData, one `file` entry)
  //     -> { url: string }
  // No company row exists yet at this point in the flow (signup creates it), so this can't
  // be scoped under /api/company/:id/logo — it has to be a standalone upload that hands back
  // a public URL, which then just rides along as company.company_logo on the register call.
  // Actually talking to Supabase Storage (or whatever storage backs this) is backend-owned —
  // this hook only posts the file and renders whatever URL comes back.
  type LogoStep = "idle" | "menu" | "upload" | "url";
  const [logoStep, setLogoStep] = useState<LogoStep>("idle");
  const [logoFileName, setLogoFileName] = useState("");
  const [logoUrlDraft, setLogoUrlDraft] = useState("");
  const [logoDragOver, setLogoDragOver] = useState(false);
  const logoFieldRef = useRef<HTMLDivElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const logoUpload = useMutation<{ url: string }>();

  // Close the "Add Company Logo" dropdown on an outside click, same as any other menu.
  useEffect(() => {
    if (logoStep !== "menu") return;
    const handleClickOutside = (e: MouseEvent) => {
      if (logoFieldRef.current && !logoFieldRef.current.contains(e.target as Node)) {
        setLogoStep("idle");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [logoStep]);

  const uploadLogoFile = async (file: File) => {
    setLogoFileName(file.name);
    const body = new FormData();
    body.append("file", file);
    try {
      const { url } = await logoUpload.mutate("/api/uploads/company-logo", body, "POST");
      set("companyLogo", url);
      setLogoStep("idle");
    } catch {
      // Wizard stays open with logoUpload.error shown so the user can retry —
      // no fabricated success.
    }
  };

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadLogoFile(file);
  };

  const handleLogoDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setLogoDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadLogoFile(file);
  };

  const confirmLogoUrl = () => {
    if (!logoUrlDraft.trim()) return;
    set("companyLogo", logoUrlDraft.trim());
    setLogoFileName("");
    setLogoStep("idle");
  };

  const removeLogo = () => {
    set("companyLogo", "");
    setLogoFileName("");
    setLogoUrlDraft("");
    setLogoStep("idle");
    logoUpload.reset();
  };

  const filledCount = useMemo(() => countValidFields(form, termsAccepted), [form, termsAccepted]);

  const set = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => {
      const n = { ...e };
      delete n[field as string];
      return n;
    });
  };

  const acceptTerms = () => {
    setTermsAccepted(true);
    setErrors((e) => {
      if (!e.terms) return e;
      const n = { ...e };
      delete n.terms;
      return n;
    });
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const cursorPos = e.target.selectionStart ?? raw.length;
    const digitsBeforeCursor = raw.slice(0, cursorPos).replace(/\D/g, "").length;
    const digits = normalizePhDigits(raw);
    const formatted = formatPhNationalNumber(digits);

    // Walk the reformatted string to find where the same count of digits lands, so the
    // cursor stays anchored to the digit the user was editing rather than snapping to
    // the end (see the useLayoutEffect above for why this needs restoring at all).
    let seen = 0;
    let newPos = formatted.length;
    if (digitsBeforeCursor === 0) {
      newPos = 0;
    } else {
      for (let i = 0; i < formatted.length; i++) {
        if (/\d/.test(formatted[i])) seen++;
        if (seen === digitsBeforeCursor) {
          newPos = i + 1;
          break;
        }
      }
    }

    pendingPhoneCursorRef.current = newPos;
    set("companyContactNumber", digits);
  };

  const addSpecialization = () => setSpecializationCount((c) => (c < 3 ? ((c + 1) as 1 | 2 | 3) : c));

  const removeLastSpecialization = () => {
    if (specializationCount === 3) {
      set("specialization3", "");
      setSpecializationCount(2);
    } else if (specializationCount === 2) {
      set("specialization2", "");
      setSpecializationCount(1);
    }
  };

  const validateStep1 = () => {
    const e: Record<string, string> = {};
    if (!form.firstName.trim()) e.firstName = "First name is required";
    if (!form.lastName.trim()) e.lastName = "Last name is required";
    if (!isValidEmail(form.email)) e.email = "Enter a valid email address";
    if (form.password.length < PASSWORD_MIN_LENGTH)
      e.password = `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
    if (form.password !== form.confirmPassword) e.confirmPassword = "Passwords do not match";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep2 = () => {
    const e: Record<string, string> = {};
    if (!form.companyName.trim()) e.companyName = "Company name is required";
    if (!form.companyAddress.trim()) e.companyAddress = "Company address is required";
    if (!isValidEmail(form.companyContactEmail)) e.companyContactEmail = "Enter a valid company contact email";
    if (form.companyContactNumber.length !== PH_NATIONAL_NUMBER_LENGTH)
      e.companyContactNumber =
        form.companyContactNumber.length === 0
          ? "Contact number is required"
          : `Enter a complete ${PH_NATIONAL_NUMBER_LENGTH}-digit number`;
    if (!form.specialization1.trim()) e.specialization1 = "At least one specialization is required";
    if (!termsAccepted) e.terms = "You must agree to the Terms and Conditions to continue";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = () => {
    if (step === 1 && validateStep1()) setStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep2()) return;
    setSubmitting(true);
    setApiError("");
    try {
      const user = await register({
        first_name: form.firstName,
        last_name: form.lastName,
        middle_name: form.middleName || undefined,
        email: form.email,
        password: form.password,
        user_role: form.userRole,
        company: {
          company_name: form.companyName,
          company_address: form.companyAddress,
          contact_email: form.companyContactEmail,
          contact_number: formatPhDisplayNumber(form.companyContactNumber),
          specialization_1: form.specialization1,
          // Keyed off specializationCount, not just the raw form value: a hidden field is
          // guaranteed undefined regardless of any stray state, never an empty string.
          specialization_2: specializationCount >= 2 ? form.specialization2 || undefined : undefined,
          specialization_3: specializationCount >= 3 ? form.specialization3 || undefined : undefined,
          company_logo: form.companyLogo || undefined,
        },
      });
      router.push(resolveOnboardingRoute(user.onboardingStep));
    } catch (err) {
      // No fabricated success — surface the real error and keep everything the user
      // entered so far (form state is untouched on failure, no wizard reset).
      setApiError(err instanceof Error ? err.message : "Registration failed. Please try again.");
      setSubmitting(false);
    }
  };

  const inputCls = (field: string) =>
    `w-full rounded-xl border ${
      errors[field] ? "border-red-400 bg-red-50" : "border-gray-200 bg-gray-50"
    } px-4 py-2.5 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20`;

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <AuthBrandPanel
        frame={fieldCountToFrame(filledCount)}
        footer={
          <div className="flex gap-2">
            {([1, 2] as Step[]).map((s) => (
              <div
                key={s}
                className={`h-2 rounded-full transition-all ${
                  step === s ? "w-6 bg-white" : "w-2 bg-white/30"
                }`}
              />
            ))}
          </div>
        }
      />

      <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto bg-white px-6 py-8">
        <div className="w-full max-w-xl">
          <div className="mb-4">
            <h2 className="text-xl font-extrabold tracking-tight text-gray-900">
              Create your account
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Set up BuildSmart for your company in 2 steps
            </p>
          </div>

          <div className="mb-5">
            <ProgressBar step={step} />
          </div>

          {apiError && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {apiError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {step === 1 && (
              <>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Your Account</h3>
                  <p className="text-xs text-gray-400">
                    This is you — the person creating the account. You&apos;ll set up the
                    company details in the next step.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                      First Name *
                    </label>
                    <input
                      value={form.firstName}
                      onChange={(e) => set("firstName", e.target.value)}
                      maxLength={MAX.firstName}
                      placeholder="Juan"
                      className={inputCls("firstName")}
                      autoFocus
                    />
                    {errors.firstName && <p className="text-xs text-red-500">{errors.firstName}</p>}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                      Middle Name <span className="font-normal normal-case text-gray-400">(optional)</span>
                    </label>
                    <input
                      value={form.middleName}
                      onChange={(e) => set("middleName", e.target.value)}
                      maxLength={MAX.middleName}
                      placeholder="Santos"
                      className={inputCls("middleName")}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                      Last Name *
                    </label>
                    <input
                      value={form.lastName}
                      onChange={(e) => set("lastName", e.target.value)}
                      maxLength={MAX.lastName}
                      placeholder="Dela Cruz"
                      className={inputCls("lastName")}
                    />
                    {errors.lastName && <p className="text-xs text-red-500">{errors.lastName}</p>}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Your Role *
                  </label>
                  <select
                    value={form.userRole}
                    onChange={(e) => set("userRole", e.target.value as Users["user_role"])}
                    className={inputCls("userRole")}
                  >
                    {USER_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-2">
                  <h3 className="text-sm font-bold text-gray-900">Account Credentials</h3>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Login Email *
                  </label>
                  <p className="text-[11px] text-gray-400">
                    This is what you&apos;ll use to sign in — different from the company&apos;s
                    contact email, which comes next.
                  </p>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    maxLength={MAX.email}
                    placeholder="you@company.com"
                    className={inputCls("email")}
                  />
                  {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Password *
                  </label>
                  <div className="relative">
                    <input
                      type={showPw ? "text" : "password"}
                      value={form.password}
                      onChange={(e) => set("password", e.target.value)}
                      placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
                      className={`${inputCls("password")} pr-11`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password && <p className="text-xs text-red-500">{errors.password}</p>}
                  {form.password.length > 0 && (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className={`h-full rounded-full transition-all ${
                            form.password.length < PASSWORD_MIN_LENGTH
                              ? "w-1/4 bg-red-400"
                              : form.password.length < 10
                                ? "w-1/2 bg-yellow-400"
                                : "w-full bg-green-500"
                          }`}
                        />
                      </div>
                      <span
                        className={`text-[10px] font-semibold ${
                          form.password.length < PASSWORD_MIN_LENGTH
                            ? "text-red-400"
                            : form.password.length < 10
                              ? "text-yellow-500"
                              : "text-green-600"
                        }`}
                      >
                        {form.password.length < PASSWORD_MIN_LENGTH
                          ? "Weak"
                          : form.password.length < 10
                            ? "Good"
                            : "Strong"}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Re-type Password *
                  </label>
                  <div className="relative">
                    <input
                      type={showCPw ? "text" : "password"}
                      value={form.confirmPassword}
                      onChange={(e) => set("confirmPassword", e.target.value)}
                      placeholder="Confirm password"
                      className={`${inputCls("confirmPassword")} pr-11`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCPw((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showCPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.confirmPassword && (
                    <p className="text-xs text-red-500">{errors.confirmPassword}</p>
                  )}
                  {form.confirmPassword.length > 0 && form.password === form.confirmPassword && (
                    <p className="flex items-center gap-1 text-xs text-green-600">
                      <Check className="h-3 w-3" /> Passwords match
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleNext}
                  className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover)"
                >
                  Continue <ChevronRight className="h-4 w-4" />
                </button>
              </>
            )}

            {step === 2 && (
              <>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Company Details</h3>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Company Name *
                  </label>
                  <input
                    value={form.companyName}
                    onChange={(e) => set("companyName", e.target.value)}
                    maxLength={MAX.companyName}
                    placeholder="e.g. JC Waterproofing Inc."
                    className={inputCls("companyName")}
                    autoFocus
                  />
                  {errors.companyName && <p className="text-xs text-red-500">{errors.companyName}</p>}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Company Address *
                  </label>
                  <input
                    value={form.companyAddress}
                    onChange={(e) => set("companyAddress", e.target.value)}
                    maxLength={MAX.companyAddress}
                    placeholder="Unit/Floor, Building, Street, City"
                    className={inputCls("companyAddress")}
                  />
                  {errors.companyAddress && <p className="text-xs text-red-500">{errors.companyAddress}</p>}
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                        Company Contact Email *
                      </label>
                      <input
                        type="email"
                        value={form.companyContactEmail}
                        onChange={(e) => set("companyContactEmail", e.target.value)}
                        maxLength={MAX.companyContactEmail}
                        placeholder="info@company.com"
                        className={inputCls("companyContactEmail")}
                      />
                      {errors.companyContactEmail && (
                        <p className="text-xs text-red-500">{errors.companyContactEmail}</p>
                      )}
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                        Company Contact Number *
                      </label>
                      <div
                        className={`flex items-center rounded-xl border text-sm transition ${
                          errors.companyContactNumber ? "border-red-400 bg-red-50" : "border-gray-200 bg-gray-50"
                        } focus-within:border-primary focus-within:bg-white focus-within:ring-2 focus-within:ring-primary/20`}
                      >
                        <span className="pl-4 text-gray-500 select-none">+63</span>
                        <input
                          ref={phoneInputRef}
                          type="tel"
                          inputMode="numeric"
                          autoComplete="tel-national"
                          value={formatPhNationalNumber(form.companyContactNumber)}
                          onChange={handlePhoneChange}
                          onFocus={(e) => {
                            // Regaining focus (tab, programmatic, or a click past the end of
                            // the visible digits) doesn't reliably leave the caret where it
                            // was — pin it to the end so resumed typing always appends
                            // instead of risking a prepend that scrambles the digit order.
                            const len = e.target.value.length;
                            e.target.setSelectionRange(len, len);
                          }}
                          placeholder="917 123 4567"
                          className="w-full bg-transparent px-2 py-2.5 outline-none"
                        />
                      </div>
                      {errors.companyContactNumber && (
                        <p className="text-xs text-red-500">{errors.companyContactNumber}</p>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    The company&apos;s public contact email — not the login email you entered
                    earlier.
                  </p>
                </div>

                {/* One field that visually divides as more are added — all three end up
                    equal-width in a single row, rather than 1 living apart from 2/3. */}
                <div
                  className={`grid grid-cols-1 gap-4 ${
                    specializationCount === 2 ? "sm:grid-cols-2" : specializationCount === 3 ? "sm:grid-cols-3" : ""
                  }`}
                >
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                        Specialization 1 *
                      </label>
                      {specializationCount === 1 && (
                        <button
                          type="button"
                          onClick={addSpecialization}
                          className="flex items-center gap-1.5 rounded-full border-2 border-primary bg-orange-50/60 px-3 py-1 text-xs font-bold text-primary transition hover:bg-primary hover:text-primary-foreground"
                        >
                          <Plus className="h-3.5 w-3.5" /> Add Specialization
                        </button>
                      )}
                    </div>
                    <input
                      value={form.specialization1}
                      onChange={(e) => set("specialization1", e.target.value)}
                      maxLength={MAX.specialization}
                      placeholder="e.g. Waterproofing Systems"
                      className={inputCls("specialization1")}
                    />
                    {errors.specialization1 && <p className="text-xs text-red-500">{errors.specialization1}</p>}
                  </div>

                  {specializationCount >= 2 && (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <label className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-gray-600">
                          Specialization 2 <span className="font-normal normal-case text-gray-400">(optional)</span>
                        </label>
                        {specializationCount === 2 && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={addSpecialization}
                              title="Add specialization 3"
                              className="text-primary hover:text-(--primary-hover)"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={removeLastSpecialization}
                              title="Remove specialization 2"
                              className="text-gray-300 hover:text-red-500"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                      <input
                        value={form.specialization2}
                        onChange={(e) => set("specialization2", e.target.value)}
                        maxLength={MAX.specialization}
                        placeholder="Optional"
                        className={inputCls("specialization2")}
                        autoFocus
                      />
                    </div>
                  )}

                  {specializationCount === 3 && (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <label className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-gray-600">
                          Specialization 3 <span className="font-normal normal-case text-gray-400">(optional)</span>
                        </label>
                        <button
                          type="button"
                          onClick={removeLastSpecialization}
                          title="Remove specialization 3"
                          className="text-gray-300 hover:text-red-500"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <input
                        value={form.specialization3}
                        onChange={(e) => set("specialization3", e.target.value)}
                        maxLength={MAX.specialization}
                        placeholder="Optional"
                        className={inputCls("specialization3")}
                        autoFocus
                      />
                    </div>
                  )}
                </div>

                <div ref={logoFieldRef} className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Company Logo <span className="font-normal normal-case text-gray-400">(optional)</span>
                  </label>

                  {form.companyLogo ? (
                    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
                      {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary external URL, not a static asset */}
                      <img
                        src={form.companyLogo}
                        alt="Company logo preview"
                        className="h-10 w-10 shrink-0 rounded-lg border border-gray-200 object-cover"
                      />
                      <span className="flex-1 truncate text-sm text-gray-700">
                        {logoFileName || form.companyLogo}
                      </span>
                      <button
                        type="button"
                        onClick={removeLogo}
                        title="Remove logo"
                        className="shrink-0 text-gray-400 transition hover:text-red-500"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setLogoStep((s) => (s === "idle" ? "menu" : "idle"))}
                        className={`flex w-full items-center justify-between rounded-xl border px-4 py-2.5 text-sm transition ${
                          logoStep !== "idle"
                            ? "border-primary bg-white ring-2 ring-primary/20"
                            : "border-gray-200 bg-gray-50 hover:bg-gray-100"
                        }`}
                      >
                        <span className="font-semibold text-gray-700">Add Company Logo</span>
                        <ChevronDown
                          className={`h-4 w-4 text-gray-400 transition-transform ${
                            logoStep !== "idle" ? "rotate-180" : ""
                          }`}
                        />
                      </button>

                      {logoStep === "menu" && (
                        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                          <button
                            type="button"
                            onClick={() => setLogoStep("upload")}
                            className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-gray-50"
                          >
                            <Upload className="h-4 w-4 shrink-0 text-gray-400" />
                            <span>
                              <span className="block text-sm font-semibold text-gray-800">
                                Upload Company Logo
                              </span>
                              <span className="block text-xs text-gray-400">
                                Drag &amp; drop or browse your computer
                              </span>
                            </span>
                          </button>
                          <div className="border-t border-gray-100" />
                          <button
                            type="button"
                            onClick={() => setLogoStep("url")}
                            className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-gray-50"
                          >
                            <LinkIcon className="h-4 w-4 shrink-0 text-gray-400" />
                            <span>
                              <span className="block text-sm font-semibold text-gray-800">
                                Paste Image URL
                              </span>
                              <span className="block text-xs text-gray-400">
                                Link to an image already hosted online
                              </span>
                            </span>
                          </button>
                        </div>
                      )}

                      {logoStep === "upload" && (
                        <div className="flex flex-col gap-1.5">
                          <div
                            onClick={() => logoInputRef.current?.click()}
                            onDragOver={(e) => {
                              e.preventDefault();
                              setLogoDragOver(true);
                            }}
                            onDragLeave={() => setLogoDragOver(false)}
                            onDrop={handleLogoDrop}
                            className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${
                              logoDragOver ? "border-primary bg-orange-50/60" : "border-gray-200 bg-gray-50"
                            }`}
                          >
                            {logoUpload.isLoading ? (
                              <>
                                <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-primary" />
                                <p className="text-xs text-gray-500">Uploading…</p>
                              </>
                            ) : (
                              <>
                                <Upload className="h-6 w-6 text-gray-400" />
                                <p className="text-sm font-semibold text-gray-700">
                                  Drag &amp; drop your logo here
                                </p>
                                <p className="text-xs text-gray-400">or click to browse your computer</p>
                              </>
                            )}
                          </div>
                          <input
                            ref={logoInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleLogoFileChange}
                            className="hidden"
                          />
                          {logoUpload.error && (
                            <p className="text-xs text-red-500">
                              Couldn&apos;t upload logo: {logoUpload.error.message}
                            </p>
                          )}
                          <button
                            type="button"
                            onClick={() => setLogoStep("idle")}
                            className="self-start text-xs font-semibold text-gray-400 transition hover:text-gray-600"
                          >
                            ← Back
                          </button>
                        </div>
                      )}

                      {logoStep === "url" && (
                        <div className="flex flex-col gap-1.5">
                          <div className="flex gap-2">
                            <input
                              type="url"
                              value={logoUrlDraft}
                              onChange={(e) => setLogoUrlDraft(e.target.value)}
                              maxLength={MAX.companyLogo}
                              placeholder="https://…"
                              className={inputCls("companyLogo")}
                              autoFocus
                            />
                            <button
                              type="button"
                              disabled={!logoUrlDraft.trim()}
                              onClick={confirmLogoUrl}
                              className="shrink-0 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition hover:bg-(--primary-hover) disabled:opacity-50"
                            >
                              Use This URL
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setLogoStep("idle");
                              setLogoUrlDraft("");
                            }}
                            className="self-start text-xs font-semibold text-gray-400 transition hover:text-gray-600"
                          >
                            ← Back
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="flex flex-col gap-1.5 border-t border-gray-100 pt-4">
                  <label className="flex items-start gap-2.5 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={termsAccepted}
                      onChange={(e) => {
                        setTermsAccepted(e.target.checked);
                        setErrors((prev) => {
                          if (!prev.terms) return prev;
                          const n = { ...prev };
                          delete n.terms;
                          return n;
                        });
                      }}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/30"
                    />
                    <span>
                      I agree to BuildSmart&apos;s{" "}
                      <button
                        type="button"
                        onClick={() => setTermsModalOpen(true)}
                        className="font-semibold text-primary underline underline-offset-2 hover:text-(--primary-hover)"
                      >
                        Terms and Conditions
                      </button>
                    </span>
                  </label>
                  {errors.terms && <p className="text-xs text-red-500">{errors.terms}</p>}
                </div>

                <div className="mt-1 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="flex-1 rounded-xl border border-gray-200 px-4 py-3.5 text-sm font-bold text-gray-600 transition hover:bg-gray-50"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !termsAccepted}
                    className="flex flex-2 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:opacity-60"
                  >
                    {submitting && (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    )}
                    {submitting ? "Creating account…" : "Create Account →"}
                  </button>
                </div>
              </>
            )}
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-primary hover:underline">
              Sign in →
            </Link>
          </p>
        </div>
      </div>

      {termsModalOpen && (
        <TermsModal onClose={() => setTermsModalOpen(false)} onAgree={acceptTerms} />
      )}
    </div>
  );
}