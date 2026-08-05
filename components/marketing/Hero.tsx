"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { logoFrame } from "@/components/logo-frames";
import { AmbientGlow } from "./AmbientGlow";

interface HeroProps {
  primaryHref: string;
  primaryLabel: string;
}

// Headline/subheadline copy is EXACT from the provided About Us doc — nothing here is
// reworded. Frame 13 (fully filled cube) matches CLAUDE.md's rule that auth/marketing
// surfaces use the real logo, never a placeholder chevron.
export function Hero({ primaryHref, primaryLabel }: HeroProps) {
  return (
    <section className="relative flex flex-col items-center gap-8 overflow-hidden bg-white px-6 py-24 text-center sm:py-32">
      <AmbientGlow />
      <Image src={logoFrame(13)} alt="" className="h-14 w-14" priority />
      <div className="flex max-w-3xl flex-col gap-5">
        <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
          Smarter Estimates. Fairer Prices. Better Builds.
        </h1>
        <p className="mx-auto max-w-2xl text-base text-gray-600 sm:text-lg">
          BuildSmart is an AI-assisted construction quotation platform built to help Philippine contractors quote
          faster, price fairly, and respond to a market where material costs never stop moving.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-4">
        <Link
          href={primaryHref}
          className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover)"
        >
          {primaryLabel} <ArrowRight className="h-4 w-4" />
        </Link>
        <a href="#solving" className="text-sm font-semibold text-gray-600 transition hover:text-primary">
          See How It Works
        </a>
      </div>
    </section>
  );
}
