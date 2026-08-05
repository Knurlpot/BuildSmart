"use client";

// Plain IntersectionObserver, not a scroll listener — fires once per element then
// disconnects, so there's no per-frame JS cost while scrolling. Pairs with the
// .about-reveal/.about-reveal-visible classes in app/globals.css (that file owns the
// actual transition + prefers-reduced-motion override; this hook only decides WHEN to add
// the "visible" class).
import { useEffect, useRef, useState } from "react";

export function useScrollReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, revealed };
}
