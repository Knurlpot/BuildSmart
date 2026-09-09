"use client";

import { useEffect, useSyncExternalStore, type RefObject } from "react";

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
function subscribe(callback: () => void) {
  const query = window.matchMedia(reducedMotionQuery);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

export function useReducedMotion() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(reducedMotionQuery).matches, () => true);
}

export function useWelcomeMotion(root: RefObject<HTMLDivElement | null>, enabled: boolean) {
  useEffect(() => {
    const element = root.current;
    if (!element || !enabled) return;
    const sections = Array.from(element.querySelectorAll<HTMLElement>("[data-reveal]"));
    const progress = element.querySelector<HTMLElement>("[data-reading-progress]");
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.setAttribute("data-visible", "true");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08 });
    sections.forEach((section) => observer.observe(section));
    element.setAttribute("data-motion-ready", "true");
    let frame = 0;
    const paint = () => {
      frame = 0;
      const scroll = window.scrollY;
      const total = document.documentElement.scrollHeight - window.innerHeight;
      progress?.style.setProperty("--reading-progress", `${total > 0 ? Math.min(scroll / total, 1) : 0}`);
    };
    const update = () => { if (!frame) frame = window.requestAnimationFrame(paint); };
    paint();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      element.removeAttribute("data-motion-ready");
    };
  }, [root, enabled]);
}
