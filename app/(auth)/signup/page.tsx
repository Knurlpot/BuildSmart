"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ChevronRight, Eye, EyeOff } from "lucide-react";
import { AuthBrandPanel } from "@/components/auth/AuthBrandPanel";
import { useAuth } from "@/providers/AuthProvider";
import { resolveOnboardingRoute } from "@/lib/onboarding";

// Schema v3 VARCHAR lengths — enforced as maxLength on the matching inputs below.
const MAX = {
  firstName: 30,
  lastName: 30,
  middleName: 30,
  companyName: 75,
  companyAddress: 255,
  companyContactEmail: 100,
  companyContactNumber: 20,
  specialization: 50,
  companyLogo: 255,
  email: 100,
} as const;

const PASSWORD_MIN_LENGTH = 6;

type Step = 1 | 2 | 3;

interface FormData {
  // Step 1 -> users
  firstName: string;
  lastName: string;
  middleName: string;
  // Step 2 -> company
  companyName: string;
  companyAddress: string;
  companyContactEmail: string;
  companyContactNumber: string;
  specialization1: string;
  specialization2: string;
  specialization3: string;
  companyLogo: string;
  // Step 3 -> users credentials
  email: string;
  password: string;
  confirmPassword: string;
}

const INIT: FormData = {
  firstName: "",
  lastName: "",
  middleName: "",
  companyName: "",
  companyAddress: "",
  companyContactEmail: "",
  companyContactNumber: "",
  specialization1: "",
  specialization2: "",
  specialization3: "",
  companyLogo: "",
  email: "",
  password: "",
  confirmPassword: "",
};

function isValidEmail(v: string) {
  return v.includes("@") && v.includes(".");
}

// 13 checks (required + optional) map onto the 14 logo frames (0-13), same convention the
// prior version of this page used.
function countValidFields(d: FormData): number {
  const checks = [
    d.firstName.trim().length > 0,
    d.lastName.trim().length > 0,
    d.middleName.trim().length > 0,
    d.companyName.trim().length > 0,
    d.companyAddress.trim().length > 0,
    isValidEmail(d.companyContactEmail),
    d.companyContactNumber.trim().length > 0,
    d.specialization1.trim().length > 0,
    d.specialization2.trim().length > 0,
    d.specialization3.trim().length > 0,
    d.companyLogo.trim().length > 0,
    isValidEmail(d.email),
    d.password.length >= PASSWORD_MIN_LENGTH && d.password === d.confirmPassword,
  ];
  return checks.filter(Boolean).length;
}

function ProgressBar({ step }: { step: Step }) {
  const steps: { n: Step; label: string }[] = [
    { n: 1, label: "User Details" },
    { n: 2, label: "Company Details" },
    { n: 3, label: "Account Credentials" },
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

  const filledCount = useMemo(() => countValidFields(form), [form]);

  const set = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => {
      const n = { ...e };
      delete n[field as string];
      return n;
    });
  };

  const validateStep1 = () => {
    const e: Record<string, string> = {};
    if (!form.firstName.trim()) e.firstName = "First name is required";
    if (!form.lastName.trim()) e.lastName = "Last name is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep2 = () => {
    const e: Record<string, string> = {};
    if (!form.companyName.trim()) e.companyName = "Company name is required";
    if (!form.companyAddress.trim()) e.companyAddress = "Company address is required";
    if (!isValidEmail(form.companyContactEmail)) e.companyContactEmail = "Enter a valid company contact email";
    if (!form.companyContactNumber.trim()) e.companyContactNumber = "Contact number is required";
    if (!form.specialization1.trim()) e.specialization1 = "At least one specialization is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep3 = () => {
    const e: Record<string, string> = {};
    if (!isValidEmail(form.email)) e.email = "Enter a valid email address";
    if (form.password.length < PASSWORD_MIN_LENGTH)
      e.password = `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
    if (form.password !== form.confirmPassword) e.confirmPassword = "Passwords do not match";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = () => {
    if (step === 1 && validateStep1()) setStep(2);
    if (step === 2 && validateStep2()) setStep(3);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep3()) return;
    setSubmitting(true);
    setApiError("");
    try {
      const user = await register({
        first_name: form.firstName,
        last_name: form.lastName,
        middle_name: form.middleName || undefined,
        email: form.email,
        password: form.password,
        user_role: "Owner",
        company: {
          company_name: form.companyName,
          company_address: form.companyAddress,
          contact_email: form.companyContactEmail,
          contact_number: form.companyContactNumber,
          specialization_1: form.specialization1,
          specialization_2: form.specialization2 || undefined,
          specialization_3: form.specialization3 || undefined,
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
        frame={filledCount}
        footer={
          <div className="flex gap-2">
            {([1, 2, 3] as Step[]).map((s) => (
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
        <div className="w-full max-w-md">
          <div className="mb-4">
            <h2 className="text-xl font-extrabold tracking-tight text-gray-900">
              Create your account
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Set up BuildSmart for your company in 3 steps
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
                <p className="text-xs text-gray-400">
                  This is you — the person creating the account. You&apos;ll be set up as the
                  Owner of the company in the next step.
                </p>

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
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Company Contact Email *
                  </label>
                  <p className="text-[11px] text-gray-400">
                    The company&apos;s public contact email — not your login email (that comes next).
                  </p>
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
                  <input
                    value={form.companyContactNumber}
                    onChange={(e) => set("companyContactNumber", e.target.value)}
                    maxLength={MAX.companyContactNumber}
                    placeholder="+63 917 123 4567"
                    className={inputCls("companyContactNumber")}
                  />
                  {errors.companyContactNumber && (
                    <p className="text-xs text-red-500">{errors.companyContactNumber}</p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Specialization 1 *
                  </label>
                  <input
                    value={form.specialization1}
                    onChange={(e) => set("specialization1", e.target.value)}
                    maxLength={MAX.specialization}
                    placeholder="e.g. Waterproofing Systems"
                    className={inputCls("specialization1")}
                  />
                  {errors.specialization1 && <p className="text-xs text-red-500">{errors.specialization1}</p>}
                </div>

                <div className="flex gap-3">
                  <div className="flex flex-1 flex-col gap-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                      Specialization 2 <span className="font-normal normal-case text-gray-400">(optional)</span>
                    </label>
                    <input
                      value={form.specialization2}
                      onChange={(e) => set("specialization2", e.target.value)}
                      maxLength={MAX.specialization}
                      placeholder="Optional"
                      className={inputCls("specialization2")}
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                      Specialization 3 <span className="font-normal normal-case text-gray-400">(optional)</span>
                    </label>
                    <input
                      value={form.specialization3}
                      onChange={(e) => set("specialization3", e.target.value)}
                      maxLength={MAX.specialization}
                      placeholder="Optional"
                      className={inputCls("specialization3")}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Company Logo <span className="font-normal normal-case text-gray-400">(optional)</span>
                  </label>
                  <input
                    value={form.companyLogo}
                    onChange={(e) => set("companyLogo", e.target.value)}
                    maxLength={MAX.companyLogo}
                    placeholder="https://…"
                    className={inputCls("companyLogo")}
                  />
                  <p className="text-[11px] text-gray-400">
                    Paste a URL for now — file upload isn&apos;t wired here yet.
                  </p>
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
                    type="button"
                    onClick={handleNext}
                    className="flex flex-2 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover)"
                  >
                    Continue <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Login Email *
                  </label>
                  <p className="text-[11px] text-gray-400">
                    This is what you&apos;ll use to sign in — different from the company contact
                    email you entered earlier.
                  </p>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    maxLength={MAX.email}
                    placeholder="you@company.com"
                    className={inputCls("email")}
                    autoFocus
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

                <div className="mt-1 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="flex-1 rounded-xl border border-gray-200 px-4 py-3.5 text-sm font-bold text-gray-600 transition hover:bg-gray-50"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
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
    </div>
  );
}
