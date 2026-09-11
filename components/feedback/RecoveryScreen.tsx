"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { logoFrame } from "@/components/logo-frames";

/** No auth, fetching or shell dependencies: also safe outside the root layout. */
export function RecoveryScreen({ notFound = false, retry }: { notFound?: boolean; retry?: () => void }) {
  return <main className="grid min-h-screen place-items-center bg-background px-6 py-16 text-foreground" style={{ backgroundColor: "#faf9f6", color: "#292b25" }}>
    <section className="w-full max-w-lg text-center" aria-labelledby="recovery-title">
      <div className="mb-10 flex items-center justify-center gap-3">
        <Image src={logoFrame(13)} alt="" width={40} height={44} priority />
        <span className="text-xl font-bold">Build<span className="text-primary">Smart</span></span>
      </div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{notFound ? "404 · Page not found" : "Let’s get you back on track"}</p>
      <h1 id="recovery-title" className="text-3xl font-bold tracking-tight sm:text-4xl">{notFound ? "This page isn’t on the blueprint." : "Something went wrong."}</h1>
      <p className="mt-5 text-sm leading-7 text-muted-foreground">{notFound ? "The link may be incorrect, or the page may have moved." : "Please try again. If the problem continues, return to your dashboard."}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {retry && <Button size="lg" onClick={retry}>Try again</Button>}
        <Button size="lg" variant={retry ? "outline" : "default"} asChild><a href="/dashboard">Go to dashboard</a></Button>
        {notFound && <Button size="lg" variant="outline" onClick={() => window.history.length > 1 ? window.history.back() : window.location.assign("/dashboard")}>Back</Button>}
      </div>
      <p className="mt-6 text-sm text-muted-foreground">Need to sign in? <a className="font-semibold text-primary underline underline-offset-4" href="/login">Sign in</a></p>
    </section>
  </main>;
}
