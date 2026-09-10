"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ChevronRight, Eye, EyeOff } from "lucide-react";
import { AuthBrandPanel } from "@/components/auth/AuthBrandPanel";
import { signupLogoStage } from "@/components/auth/signup-logo-progress";
import { TermsModal } from "@/components/auth/TermsModal";
import { SpecializationSelect } from "@/components/forms/SpecializationSelect";
import { useAuth } from "@/providers/AuthProvider";
import { lookupInviteCode, type CompanyLookupResult } from "@/lib/api/auth";
import { specializationsToColumns } from "@/lib/specializations";

const MAX = {
  firstName: 30,
  lastName: 30,
  middleName: 30,
  companyName: 75,
  companyAddress: 255,
  companyContactEmail: 100,
  email: 100,
} as const;

const PASSWORD_MIN_LENGTH = 8;

type Step = 1 | 2 | 3;
type CompanyMode = "join" | "create";

interface FormData {
  // Step 1 -> users
  firstName: string;
  lastName: string;
  middleName: string;
  email: string;
  password: string;
  confirmPassword: string;
  // Step 2 -> company
  companyName: string;
  companyAddress: string;
  companyContactEmail: string;
  companyContactNumber: string;
  specializations: string[];
  inviteCode: string;
}

const INIT: FormData = {
  firstName: "",
  lastName: "",
  middleName: "",
  email: "",
  password: "",
  confirmPassword: "",
  companyName: "",
  companyAddress: "",
  companyContactEmail: "",
  companyContactNumber: "",
  specializations: [],
  inviteCode: "",
};

function isValidEmail(v: string) {
  return v.includes("@") && v.includes(".");
}

const PH_NATIONAL_NUMBER_LENGTH = 10;

function normalizePhDigits(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("63") && d.length > PH_NATIONAL_NUMBER_LENGTH) d = d.slice(2);
  else if (d.startsWith("0") && d.length > PH_NATIONAL_NUMBER_LENGTH) d = d.slice(1);
  return d.slice(0, PH_NATIONAL_NUMBER_LENGTH);
}

// PH number format
function formatPhNationalNumber(digits: string): string {
  return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 10)].filter(Boolean).join(" ");
}

// "+63" in Phil Number format
function formatPhDisplayNumber(digits: string): string {
  const national = formatPhNationalNumber(digits);
  return national ? `+63 ${national}` : "";
}

function ProgressBar({ step }: { step: Step }) {
  const steps: { n: Step; label: string }[] = [
    { n: 1, label: "Your Account" },
    { n: 2, label: "Invite Code" },
    { n: 3, label: "Verify & Join" },
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
  const [companyMode, setCompanyMode] = useState<CompanyMode>("join");
  const [matchedCompany, setMatchedCompany] = useState<CompanyLookupResult | null>(null);
  const [inviteLookupLoading, setInviteLookupLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showCPw, setShowCPw] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const [phoneFocused, setPhoneFocused] = useState(false);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const pendingPhoneCursorRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (pendingPhoneCursorRef.current !== null && phoneInputRef.current) {
      phoneInputRef.current.setSelectionRange(pendingPhoneCursorRef.current, pendingPhoneCursorRef.current);
      pendingPhoneCursorRef.current = null;
    }
  });

  const logoStage = signupLogoStage(form, companyMode, termsAccepted);

  const set = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => {
      const n = { ...e };
      delete n[field as string];
      return n;
    });
    if (field === "inviteCode") {
      setMatchedCompany(null);
      setCompanyMode("join");
    }
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

    // 
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
    if (companyMode === "join" && !form.inviteCode.trim()) e.inviteCode = "Enter an invite code or choose create new";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep3 = () => {
    if (companyMode === "join") {
      const e: Record<string, string> = {};
      if (!form.inviteCode.trim()) e.inviteCode = "Enter an invite code";
      if (!termsAccepted) e.terms = "You must agree to the Terms and Conditions to continue";
      setErrors(e);
      return Object.keys(e).length === 0;
    }
    const e: Record<string, string> = {};
    if (!form.companyName.trim()) e.companyName = "Company name is required";
    if (!form.companyAddress.trim()) e.companyAddress = "Company address is required";
    if (!isValidEmail(form.companyContactEmail)) e.companyContactEmail = "Enter a company email";
    if (form.companyContactNumber.length !== PH_NATIONAL_NUMBER_LENGTH)
      e.companyContactNumber =
        form.companyContactNumber.length === 0
          ? "Contact number is required"
          : `Enter a complete ${PH_NATIONAL_NUMBER_LENGTH}-digit number`;
    if (form.specializations.length === 0) e.specializations = "At least one specialization is required";
    if (!termsAccepted) e.terms = "You must agree to the Terms and Conditions to continue";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = async () => {
    if (step === 1 && validateStep1()) {
      setStep(2);
      return;
    }

    if (step !== 2 || !validateStep2()) return;
    if (companyMode === "create") {
      setMatchedCompany(null);
      setStep(3);
      return;
    }

    setInviteLookupLoading(true);
    setApiError("");
    try {
      const { company } = await lookupInviteCode(form.inviteCode.trim().toUpperCase());
      setMatchedCompany(company);
      setStep(3);
    } catch (err) {
      setMatchedCompany(null);
      setErrors((current) => ({
        ...current,
        inviteCode: err instanceof Error ? err.message : "Invite code could not be verified",
      }));
    } finally {
      setInviteLookupLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep3()) {
      if (!termsAccepted) setTermsModalOpen(true);
      return;
    }
    setSubmitting(true);
    setApiError("");
    try {
      const companyPayload =
        companyMode === "join"
          ? { invite_code: form.inviteCode.trim().toUpperCase() }
          : {
              company: {
                company_name: form.companyName,
                company_address: form.companyAddress,
                contact_email: form.companyContactEmail,
                contact_number: formatPhDisplayNumber(form.companyContactNumber),
                ...specializationsToColumns(form.specializations),
              },
            };
      await register({
        first_name: form.firstName,
        last_name: form.lastName,
        middle_name: form.middleName || undefined,
        email: form.email,
        password: form.password,
        ...companyPayload,
      });
      router.push("/dashboard");
    } catch (err) {
      // No fabricated success — surface the real error and keep everything the user
      // entered so far (form state is untouched on failure, no wizard reset).
      const message = err instanceof Error ? err.message : "Registration failed. Please try again.";
      setApiError(message);
      if (message.toLowerCase().includes("already exists")) {
        setStep(1);
        setErrors((current) => ({ ...current, email: message }));
      }
      setSubmitting(false);
    }
  };

  const floatingInputCls = (field: string, extra = "") =>
    `peer w-full rounded-xl border ${
      errors[field] ? "border-red-400 bg-red-50" : "border-gray-200 bg-gray-50"
    } px-4 pb-2.5 pt-5 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20 ${extra}`;
  const floatingLabelCls =
    "pointer-events-none absolute left-4 top-2 text-[10px] font-semibold text-gray-500 transition-all peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-placeholder-shown:font-medium peer-focus:top-2 peer-focus:translate-y-0 peer-focus:text-[10px] peer-focus:font-semibold peer-focus:text-primary";
  const phoneActive = phoneFocused || form.companyContactNumber.length > 0;

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <AuthBrandPanel
        frame={logoStage}
        animateProgress
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
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Your Account</h3>
                  <p className="text-xs text-gray-400">
                    Enter your details.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="flex flex-col gap-1.5">
                    <div className="relative">
                      <input
                        id="signup-first-name"
                        value={form.firstName}
                        onChange={(e) => set("firstName", e.target.value)}
                        maxLength={MAX.firstName}
                        placeholder=" "
                        className={floatingInputCls("firstName")}
                        autoFocus
                      />
                      <label htmlFor="signup-first-name" className={floatingLabelCls}>
                        First Name <span className="text-red-500">*</span>
                      </label>
                    </div>
                    {errors.firstName && <p className="text-xs text-red-500">{errors.firstName}</p>}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="relative">
                      <input
                        id="signup-middle-name"
                        value={form.middleName}
                        onChange={(e) => set("middleName", e.target.value)}
                        maxLength={MAX.middleName}
                        placeholder=" "
                        className={floatingInputCls("middleName")}
                      />
                      <label htmlFor="signup-middle-name" className={floatingLabelCls}>
                        Middle Name
                      </label>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="relative">
                      <input
                        id="signup-last-name"
                        value={form.lastName}
                        onChange={(e) => set("lastName", e.target.value)}
                        maxLength={MAX.lastName}
                        placeholder=" "
                        className={floatingInputCls("lastName")}
                      />
                      <label htmlFor="signup-last-name" className={floatingLabelCls}>
                        Last Name <span className="text-red-500">*</span>
                      </label>
                    </div>
                    {errors.lastName && <p className="text-xs text-red-500">{errors.lastName}</p>}
                  </div>
                </div>

                <div className="mt-2">
                  <h3 className="text-sm font-bold text-gray-900">Account Credentials</h3>
                  <p className="text-[11px] text-gray-400">
                    The email will be used for logging in
                  </p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="relative">
                    <input
                      id="signup-login-email"
                      type="email"
                      value={form.email}
                      onChange={(e) => set("email", e.target.value)}
                      maxLength={MAX.email}
                      placeholder=" "
                      className={floatingInputCls("email")}
                    />
                    <label htmlFor="signup-login-email" className={floatingLabelCls}>
                      Login Email <span className="text-red-500">*</span>
                    </label>
                  </div>
                  {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="relative">
                    <input
                      id="signup-password"
                      type={showPw ? "text" : "password"}
                      value={form.password}
                      onChange={(e) => set("password", e.target.value)}
                      placeholder=" "
                      className={floatingInputCls("password", "pr-11")}
                    />
                    <label htmlFor="signup-password" className={floatingLabelCls}>
                      Password <span className="text-red-500">*</span>
                    </label>
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
                  <div className="relative">
                    <input
                      id="signup-confirm-password"
                      type={showCPw ? "text" : "password"}
                      value={form.confirmPassword}
                      onChange={(e) => set("confirmPassword", e.target.value)}
                      placeholder=" "
                      className={floatingInputCls("confirmPassword", "pr-11")}
                    />
                    <label htmlFor="signup-confirm-password" className={floatingLabelCls}>
                      Confirm Password <span className="text-red-500">*</span>
                    </label>
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
                  <h3 className="text-sm font-bold text-gray-900">Invite Code</h3>
                  <p className="text-xs text-gray-400">
                    Enter the code from your company owner.
                  </p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="relative">
                    <input
                      id="signup-invite-code"
                      value={form.inviteCode}
                      onChange={(e) => set("inviteCode", e.target.value.toUpperCase())}
                      placeholder=" "
                      className={floatingInputCls("inviteCode", "font-mono tracking-wide")}
                      autoFocus
                    />
                    <label htmlFor="signup-invite-code" className={floatingLabelCls}>
                      Invite Code <span className="text-red-500">*</span>
                    </label>
                  </div>
                  {errors.inviteCode && <p className="text-xs text-red-500">{errors.inviteCode}</p>}
                </div>

                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                  <label className="flex items-start gap-2.5 text-sm text-gray-700">
                    <input
                      type="radio"
                      checked={companyMode === "create"}
                      onChange={() => {
                        setCompanyMode("create");
                        setMatchedCompany(null);
                      }}
                      className="mt-0.5 h-4 w-4 shrink-0 border-gray-300 text-primary focus:ring-2 focus:ring-primary/30"
                    />
                    <span>Create a new company account.</span>
                  </label>
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
                    disabled={inviteLookupLoading}
                    className="flex flex-2 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover)"
                  >
                    {inviteLookupLoading ? "Checking..." : "Continue"} <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">
                    {companyMode === "join" ? "Verify & Join" : "Create Company"}
                  </h3>
                </div>

                {companyMode === "join" && (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">Company Match</p>
                    <p className="mt-2 text-sm font-bold text-gray-900">{matchedCompany?.company_name ?? "Company"}</p>
                    <p className="mt-2 text-sm text-gray-600">{matchedCompany?.company_address ?? "—"}</p>
                    <p className="mt-1 text-sm text-gray-600">{matchedCompany?.contact_email ?? "—"}</p>
                    <p className="mt-1 text-sm text-gray-600">{matchedCompany?.contact_number ?? "—"}</p>
                    {matchedCompany && matchedCompany.specializations.length > 0 && (
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs font-semibold text-primary">
                        {matchedCompany.specializations.map((specialization) => (
                          <li key={specialization}>{specialization}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {companyMode === "create" && (
                  <>

                <div className="flex flex-col gap-1.5">
                  <div className="relative">
                    <input
                      id="signup-company-name"
                      value={form.companyName}
                      onChange={(e) => set("companyName", e.target.value)}
                      maxLength={MAX.companyName}
                      placeholder=" "
                      className={floatingInputCls("companyName")}
                      autoFocus
                    />
                    <label htmlFor="signup-company-name" className={floatingLabelCls}>
                      Company Name <span className="text-red-500">*</span>
                    </label>
                  </div>
                  {errors.companyName && <p className="text-xs text-red-500">{errors.companyName}</p>}
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="relative">
                    <input
                      id="signup-company-address"
                      value={form.companyAddress}
                      onChange={(e) => set("companyAddress", e.target.value)}
                      maxLength={MAX.companyAddress}
                      placeholder=" "
                      className={floatingInputCls("companyAddress")}
                    />
                    <label htmlFor="signup-company-address" className={floatingLabelCls}>
                      Company Address <span className="text-red-500">*</span>
                    </label>
                  </div>
                  {errors.companyAddress && <p className="text-xs text-red-500">{errors.companyAddress}</p>}
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <div className="relative">
                        <input
                          id="signup-company-contact-email"
                          type="email"
                          value={form.companyContactEmail}
                          onChange={(e) => set("companyContactEmail", e.target.value)}
                          maxLength={MAX.companyContactEmail}
                          placeholder=" "
                          className={floatingInputCls("companyContactEmail")}
                        />
                        <label htmlFor="signup-company-contact-email" className={floatingLabelCls}>
                          Company Contact Email <span className="text-red-500">*</span>
                        </label>
                      </div>
                      {errors.companyContactEmail && (
                        <p className="text-xs text-red-500">{errors.companyContactEmail}</p>
                      )}
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <div
                        className={`group relative flex items-center rounded-xl border text-sm transition ${
                          errors.companyContactNumber ? "border-red-400 bg-red-50" : "border-gray-200 bg-gray-50"
                        } focus-within:border-primary focus-within:bg-white focus-within:ring-2 focus-within:ring-primary/20`}
                      >
                        <label
                          htmlFor="signup-company-contact-number"
                          className={`pointer-events-none absolute left-4 text-gray-500 transition-all ${
                            phoneActive
                              ? "top-2 translate-y-0 text-[10px] font-semibold text-primary"
                              : "top-1/2 -translate-y-1/2 text-sm font-medium text-gray-500"
                          }`}
                        >
                          Company Contact Number <span className="text-red-500">*</span>
                        </label>
                        <span className={`pl-4 pt-3 text-gray-500 transition-opacity select-none ${phoneActive ? "opacity-100" : "opacity-0"}`}>+63</span>
                        <input
                          id="signup-company-contact-number"
                          ref={phoneInputRef}
                          type="tel"
                          inputMode="numeric"
                          autoComplete="tel-national"
                          value={formatPhNationalNumber(form.companyContactNumber)}
                          onChange={handlePhoneChange}
                          onFocus={(e) => {
                            setPhoneFocused(true);
                            // Regaining focus (tab, programmatic, or a click past the end of
                            // the visible digits) doesn't reliably leave the caret where it
                            // was — pin it to the end so resumed typing always appends
                            // instead of risking a prepend that scrambles the digit order.
                            const len = e.target.value.length;
                            e.target.setSelectionRange(len, len);
                          }}
                          onBlur={() => setPhoneFocused(false)}
                          placeholder=""
                          className="w-full bg-transparent px-2 pb-2.5 pt-5 outline-none"
                        />
                      </div>
                      {errors.companyContactNumber && (
                        <p className="text-xs text-red-500">{errors.companyContactNumber}</p>
                      )}
                    </div>
                  </div>
                </div>

                <SpecializationSelect
                  selected={form.specializations}
                  onChange={(next) => set("specializations", next)}
                  error={errors.specializations}
                />

                  </>
                )}

                <div className="flex flex-col gap-1.5 border-t border-gray-100 pt-4">
                  <label className="flex items-start gap-2.5 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={termsAccepted}
                      readOnly
                      onClick={() => setTermsModalOpen(true)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/30"
                    />
                    <span>
                      {termsAccepted ? "I agree to" : "Open and read"} BuildSmart&apos;s{" "}
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
                    onClick={() => setStep(2)}
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
