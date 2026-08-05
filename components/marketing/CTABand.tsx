"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useScrollReveal } from "./useScrollReveal";

interface CTABandProps {
  heading: string;
  subtext: string;
  ctaHref: string;
  ctaLabel: string;
}

// Reuses .animate-brand-gradient verbatim — the same shifting brand-orange gradient the
// login/signup AuthBrandPanel uses — instead of a new background treatment.
export function CTABand({ heading, subtext, ctaHref, ctaLabel }: CTABandProps) {
  const { ref, revealed } = useScrollReveal<HTMLElement>();

  return (
    <section
      ref={ref}
      className={`about-reveal ${revealed ? "about-reveal-visible" : ""} animate-brand-gradient flex flex-col items-center gap-5 px-6 py-20 text-center sm:py-24`}
    >
      <h2 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{heading}</h2>
      <p className="max-w-xl text-sm text-white/80 sm:text-base">{subtext}</p>
      <Link
        href={ctaHref}
        className="flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-bold text-primary shadow-sm transition hover:bg-white/90"
      >
        {ctaLabel} <ArrowRight className="h-4 w-4" />
      </Link>
    </section>
  );
}
