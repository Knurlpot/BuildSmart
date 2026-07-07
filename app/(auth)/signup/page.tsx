"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ChevronRight, Eye, EyeOff, Upload, X } from "lucide-react";
import { AuthBrandPanel } from "@/components/auth/AuthBrandPanel";
import { useAuth } from "@/providers/AuthProvider";

const REGIONS = ["Metro Manila", "North Luzon", "South Luzon", "Visayas", "Mindanao"];
const SECTORS = ["Residential", "Commercial", "Industrial", "Institutional", "Infrastructure"];
const ROLES = ["Main Contractor", "Subcontractor", "Developer", "Consultant", "Supplier", "Owner-Builder"];
const SPECIALIZATIONS = ["Waterproofing", "Tile Works", "Painting", "Structural", "MEP", "Civil Works", "Roofing", "Facade"];

type Step = 1 | 2 | 3;

interface FormData {
  logoFile: File | null;
  logoDataUrl: string;
  companyName: string;
  phone: string;
  address: string;
  city: string;
  province: string;
  email: string;
  password: string;
  confirmPassword: string;
  serviceRegions: string[];
  projectSectors: string[];
  companyRole: string;
  specializations: string[];
}

const INIT: FormData = {
  logoFile: null,
  logoDataUrl: "",
  companyName: "",
  phone: "",
  address: "",
  city: "",
  province: "",
  email: "",
  password: "",
  confirmPassword: "",
  serviceRegions: [],
  projectSectors: [],
  companyRole: "",
  specializations: [],
};

function countValidFields(d: FormData): number {
  const checks = [
    Boolean(d.logoFile || d.logoDataUrl),
    d.companyName.trim().length > 0,
    d.phone.trim().length > 0,
    d.address.trim().length > 0,
    d.city.trim().length > 0,
    d.province.trim().length > 0,
    d.email.includes("@") && d.email.includes("."),
    d.password.length >= 6,
    d.confirmPassword.length > 0 && d.password === d.confirmPassword,
    d.serviceRegions.length > 0,
    d.projectSectors.length > 0,
    Boolean(d.companyRole),
    d.specializations.length > 0,
  ];
  return checks.filter(Boolean).length;
}

function PillSelect({
  options,
  selected,
  onChange,
  max,
}: {
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  max?: number;
}) {
  const toggle = (opt: string) => {
    if (selected.includes(opt)) {
      onChange(selected.filter((s) => s !== opt));
    } else if (!max || selected.length < max) {
      onChange([...selected, opt]);
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-gray-200 bg-gray-50 text-gray-600 hover:border-primary hover:text-primary"
            }`}
          >
            {active && <Check className="h-3 w-3" />}
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function ProgressBar({ step }: { step: Step }) {
  const steps: { n: Step; label: string }[] = [
    { n: 1, label: "Company Info" },
    { n: 2, label: "Account Setup" },
    { n: 3, label: "Service Profile" },
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
  const fileRef = useRef<HTMLInputElement>(null);

  const filledCount = useMemo(() => countValidFields(form), [form]);

  const set = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => {
      const n = { ...e };
      delete n[field as string];
      return n;
    });
  };

  const handleLogo = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => set("logoDataUrl", (e.target?.result as string) ?? "");
    reader.readAsDataURL(file);
    set("logoFile", file);
  };

  const validateStep1 = () => {
    const e: Record<string, string> = {};
    if (!form.companyName.trim()) e.companyName = "Company name is required";
    if (!form.phone.trim()) e.phone = "Phone number is required";
    if (!form.address.trim()) e.address = "Address is required";
    if (!form.city.trim()) e.city = "City is required";
    if (!form.province.trim()) e.province = "Province / Region is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep2 = () => {
    const e: Record<string, string> = {};
    if (!form.email || !form.email.includes("@")) e.email = "Enter a valid email address";
    if (form.password.length < 6) e.password = "Password must be at least 6 characters";
    if (form.password !== form.confirmPassword) e.confirmPassword = "Passwords do not match";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep3 = () => {
    const e: Record<string, string> = {};
    if (!form.companyRole) e.companyRole = "Please select your company role";
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
        email: form.email,
        password: form.password,
        company: {
          name: form.companyName,
          company_address: form.address,
          contact_number: form.phone,
          city: form.city,
          region: form.province,
          project_sector: form.projectSectors,
          company_role: form.companyRole,
          specialization: form.specializations,
          company_logo: form.logoDataUrl || undefined,
        },
      });
      router.push(user.onboardingStep < 2 ? "/pricelist" : "/dashboard");
    } catch (err) {
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
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Company Logo (optional)
                  </label>
                  {form.logoDataUrl ? (
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element -- user-provided data: URL, not an optimizable static asset */}
                      <img
                        src={form.logoDataUrl}
                        alt="Logo"
                        className="h-14 w-14 rounded-xl border border-gray-200 object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          set("logoFile", null);
                          set("logoDataUrl", "");
                        }}
                        className="flex items-center gap-1 text-xs font-medium text-red-500 hover:text-red-700"
                      >
                        <X className="h-3 w-3" /> Remove
                      </button>
                    </div>
                  ) : (
                    <div
                      onClick={() => fileRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const f = e.dataTransfer.files[0];
                        if (f?.type.startsWith("image/")) handleLogo(f);
                      }}
                      className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 py-5 transition hover:border-primary hover:bg-orange-50/30"
                    >
                      <Upload className="h-5 w-5 text-gray-400" />
                      <p className="text-xs text-gray-500">
                        Drop logo here or <span className="font-semibold text-primary">browse</span>
                      </p>
                    </div>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleLogo(f);
                    }}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Company Name *
                  </label>
                  <input
                    value={form.companyName}
                    onChange={(e) => set("companyName", e.target.value)}
                    placeholder="e.g. JC Waterproofing Inc."
                    className={inputCls("companyName")}
                  />
                  {errors.companyName && <p className="text-xs text-red-500">{errors.companyName}</p>}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Office Phone *
                  </label>
                  <input
                    value={form.phone}
                    onChange={(e) => set("phone", e.target.value)}
                    placeholder="+63 917 123 4567"
                    className={inputCls("phone")}
                  />
                  {errors.phone && <p className="text-xs text-red-500">{errors.phone}</p>}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Company Address *
                  </label>
                  <input
                    value={form.address}
                    onChange={(e) => set("address", e.target.value)}
                    placeholder="Unit/Floor, Building, Street"
                    className={inputCls("address")}
                  />
                  {errors.address && <p className="text-xs text-red-500">{errors.address}</p>}
                </div>

                <div className="flex gap-3">
                  <div className="flex flex-1 flex-col gap-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                      City *
                    </label>
                    <input
                      value={form.city}
                      onChange={(e) => set("city", e.target.value)}
                      placeholder="Quezon City"
                      className={inputCls("city")}
                    />
                    {errors.city && <p className="text-xs text-red-500">{errors.city}</p>}
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                      Province *
                    </label>
                    <input
                      value={form.province}
                      onChange={(e) => set("province", e.target.value)}
                      placeholder="NCR"
                      className={inputCls("province")}
                    />
                    {errors.province && <p className="text-xs text-red-500">{errors.province}</p>}
                  </div>
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
                    Email Address *
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
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
                      placeholder="At least 6 characters"
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
                            form.password.length < 6
                              ? "w-1/4 bg-red-400"
                              : form.password.length < 10
                                ? "w-1/2 bg-yellow-400"
                                : "w-full bg-green-500"
                          }`}
                        />
                      </div>
                      <span
                        className={`text-[10px] font-semibold ${
                          form.password.length < 6
                            ? "text-red-400"
                            : form.password.length < 10
                              ? "text-yellow-500"
                              : "text-green-600"
                        }`}
                      >
                        {form.password.length < 6 ? "Weak" : form.password.length < 10 ? "Good" : "Strong"}
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
                    Service Regions{" "}
                    <span className="font-normal normal-case text-gray-400">(select all that apply)</span>
                  </label>
                  <PillSelect
                    options={REGIONS}
                    selected={form.serviceRegions}
                    onChange={(v) => set("serviceRegions", v)}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Project Sectors <span className="font-normal normal-case text-gray-400">(up to 3)</span>
                  </label>
                  <PillSelect
                    options={SECTORS}
                    selected={form.projectSectors}
                    onChange={(v) => set("projectSectors", v)}
                    max={3}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Company Role *
                  </label>
                  <select
                    value={form.companyRole}
                    onChange={(e) => set("companyRole", e.target.value)}
                    className={inputCls("companyRole")}
                  >
                    <option value="">Select your role…</option>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  {errors.companyRole && <p className="text-xs text-red-500">{errors.companyRole}</p>}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Service Specialization{" "}
                    <span className="font-normal normal-case text-gray-400">(up to 3)</span>
                  </label>
                  <PillSelect
                    options={SPECIALIZATIONS}
                    selected={form.specializations}
                    onChange={(v) => set("specializations", v)}
                    max={3}
                  />
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
