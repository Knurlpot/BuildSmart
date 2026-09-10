"use client";

import { useEffect, useRef } from "react";
import bricks from "./logo-bricks.json";
import styles from "./brick-logo.module.css";

export const LOGO_CYCLE_MS = 12000;

export function brickKeyframes(order: number): Keyframe[] {
  const start = 0.04 + order * 0.0043;
  return [
    { opacity: 0, transform: "translateY(-12px)", offset: 0 },
    { opacity: 0, transform: "translateY(-12px)", offset: start, easing: "cubic-bezier(.22,.61,.36,1)" },
    { opacity: 1, transform: "translateY(0)", offset: start + 0.045 },
    { opacity: 1, transform: "translateY(0)", offset: 0.74, easing: "ease-in-out" },
    { opacity: 0, transform: "translateY(0)", offset: 0.86 },
    { opacity: 0, transform: "translateY(0)", offset: 1 },
  ];
}

/** Exact 72 source paths; Field 0–13 determine their original build-stage order. */
export function BrickLogo({ motion, stage, className = "" }: { motion: boolean; stage?: number; className?: string }) {
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element || !motion || stage !== undefined || typeof Element.prototype.animate !== "function") return;
    const paths = Array.from(element.querySelectorAll<SVGPathElement>("[data-brick]"));
    const animations = paths.map((path, index) => {
      const animation = path.animate(brickKeyframes(bricks[index].order), { duration: LOGO_CYCLE_MS, iterations: Infinity, fill: "both" });
      animation.pause();
      animation.currentTime = 0;
      return animation;
    });
    let visible = false;
    const update = () => {
      for (const animation of animations) {
        if (visible && !document.hidden) animation.play();
        else animation.pause();
      }
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); }, { threshold: 0.2 });
    observer.observe(element);
    document.addEventListener("visibilitychange", update);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", update); animations.forEach(animation => animation.cancel()); };
  }, [motion, stage]);

  return <span ref={root} data-progress={stage !== undefined ? "true" : undefined} data-motion={motion} className={`${styles.logo} ${className}`}>
    <span className={styles.glow} aria-hidden="true" />
    <svg viewBox="0 0 459 490" role="img" aria-label="BuildSmart logo" className={styles.drawing}>
      {bricks.map(brick => {
        const visible = stage === undefined || brick.stage <= stage;
        return <path key={brick.sourceIndex} data-brick={brick.sourceIndex} d={brick.d} fill={brick.fill}
          style={stage === undefined ? undefined : {
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(-12px)",
            transitionDelay: visible ? `${(brick.order % 6) * 45}ms` : "0ms",
          }} />;
      })}
    </svg>
  </span>;
}
