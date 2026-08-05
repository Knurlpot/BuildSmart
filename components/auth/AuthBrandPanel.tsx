import Image from "next/image";
import Link from "next/link";
import { logoFrame } from "@/components/logo-frames";

interface AuthBrandPanelProps {
  frame: number;
  title?: string;
  subtitle?: React.ReactNode;
  footer?: React.ReactNode;
}

export function AuthBrandPanel({
  frame,
  title = "BuildSmart",
  subtitle,
  footer,
}: AuthBrandPanelProps) {
  return (
    <div className="animate-brand-gradient relative hidden w-[42%] flex-col items-center justify-center gap-10 lg:flex">
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage:
            "radial-gradient(circle at 30% 70%, white 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
      <div className="relative flex flex-col items-center gap-6">
        <Image src={logoFrame(frame)} alt="" priority className="h-auto w-32" />
        <div className="text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            {title}
          </h1>
          {subtitle && (
            <div className="mt-1 text-sm font-medium text-white/70">
              {subtitle}
            </div>
          )}
        </div>
      </div>
      {/* Always rendered (independent of the `footer` prop) — same quiet treatment as the
          existing footer content (text-xs text-white/50), just its own link one row below
          whatever page-specific footer content is passed in. Routes to /about, where a
          logged-out visitor lands in the public marketing view. */}
      <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center gap-3">
        {footer}
        <Link href="/about" className="text-xs font-medium text-white/50 transition hover:text-white/80 hover:underline">
          Learn more about us →
        </Link>
      </div>
    </div>
  );
}
