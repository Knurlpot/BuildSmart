"use client";

// Alternating full-width band — the Procore-reference structure (spacious, one section
// per screen-width strip) rendered entirely in BuildSmart's own tokens: no new colors,
// just var(--primary)-derived tints already used elsewhere in this app (e.g. the
// orange-50 hover states throughout CPRM/QG). Scroll-reveals itself once via
// useScrollReveal — every band on the page gets the same entrance treatment for free.
import type { ReactNode } from "react";
import { useScrollReveal } from "./useScrollReveal";

interface SectionBandProps {
  heading?: string;
  eyebrow?: string;
  tone?: "white" | "tinted";
  children: ReactNode;
  className?: string;
}

export function SectionBand({ heading, eyebrow, tone = "white", children, className = "" }: SectionBandProps) {
  const { ref, revealed } = useScrollReveal<HTMLElement>();

  return (
    <section
      ref={ref}
      className={`about-reveal ${revealed ? "about-reveal-visible" : ""} ${
        tone === "tinted" ? "bg-orange-50/40" : "bg-white"
      } px-6 py-20 sm:px-10 lg:px-16`}
    >
      <div className={`mx-auto flex w-full max-w-5xl flex-col gap-6 ${className}`}>
        {(eyebrow || heading) && (
          <div className="flex flex-col gap-2">
            {eyebrow && <p className="text-xs font-bold uppercase tracking-widest text-primary">{eyebrow}</p>}
            {heading && <h2 className="text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">{heading}</h2>}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}
