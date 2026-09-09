"use client";

import { useEffect, useId, useRef, type RefObject } from "react";
import { SKYLINE_BASELINE, SKYLINE_GROUPS, SKYLINE_HEIGHT, SKYLINE_PARTS, SKYLINE_WIDTH, sampleBuilding, sampleSkylineScene } from "./skyline-motion";
import styles from "./skyline.module.css";

const palette = [...new Set(SKYLINE_PARTS.map((part) => part.fill))];

export function SkylineBackground({ page, enabled }: { page: RefObject<HTMLDivElement | null>; enabled: boolean }) {
  const environment = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/:/g, "");
  const gradientId = (fill: string) => `${uid}-color-${fill.slice(1)}`;

  useEffect(() => {
    const container = environment.current;
    const welcome = page.current;
    if (!container || !welcome) return;

    // Cache DOM references; scrolling doesn't render React or remeasure 197 paths.
    const groups = SKYLINE_GROUPS.map((group) => ({
      group,
      parts: Array.from(container.querySelectorAll<SVGGElement>(`[data-building="${group.id}"]`)),
    }));
    const water = container.querySelector<SVGGElement>("[data-reflections]");
    const baseline = container.querySelector<SVGGElement>("[data-baseline]");
    const footer = welcome.querySelector("footer");
    let frame = 0;
    let pageTop = 0;
    let scrollRange = 1;
    let viewportWidth = window.innerWidth;

    const paint = () => {
      frame = 0;
      const progress = (window.scrollY - pageTop) / scrollRange;
      const scene = sampleSkylineScene(progress, viewportWidth, !enabled);
      container.style.setProperty("--skyline-atmosphere", String(scene.atmosphere));
      container.style.setProperty("--skyline-ground-opacity", String(scene.groundOpacity));
      container.dataset.scrollProgress = scene.progress.toFixed(3);
      water?.setAttribute("opacity", String(scene.reflection * 0.5));
      baseline?.setAttribute("opacity", String(scene.foreground * 0.65));

      for (const { group, parts } of groups) {
        const state = sampleBuilding(group, scene);
        for (const part of parts) {
          const y = part.dataset.reflection === "true" ? state.reflectedY : state.y;
          part.setAttribute("transform", `translate(${state.x.toFixed(3)} ${y.toFixed(3)})`);
          part.setAttribute("opacity", String(state.opacity));
        }
      }
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(paint);
    };
    const measure = () => {
      const bounds = welcome.getBoundingClientRect();
      pageTop = bounds.top + window.scrollY;
      scrollRange = Math.max(1, bounds.height - window.innerHeight);
      viewportWidth = welcome.clientWidth;
      container.style.setProperty("--skyline-art-width", `${Math.max(viewportWidth, 760)}px`);
      container.style.setProperty("--skyline-footer-height", `${footer?.getBoundingClientRect().height ?? 84}px`);
      schedule();
    };

    measure();
    // Observe async content/font/image changes as well as viewport changes.
    const observer = new ResizeObserver(measure);
    observer.observe(welcome);
    if (footer) observer.observe(footer);
    if (enabled) window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", measure);
    };
  }, [page, enabled]);

  function renderPart(part: (typeof SKYLINE_PARTS)[number]) {
    const path = <path d={part.d} fill={`url(#${gradientId(part.fill)})`} />;
    const source = part.grouped
      ? <g opacity={part.opacity} style={part.hardLight ? { mixBlendMode: "hard-light" } : undefined}>{path}</g>
      : path;
    return <g
      key={part.sourceIndex}
      data-source-index={part.sourceIndex}
      data-building={part.group?.id}
      data-reflection={part.reflection ? "true" : undefined}
      data-baseline={part.sourceIndex === 196 ? "true" : undefined}
      mask={part.group?.tower && !part.reflection ? `url(#${uid}-tower-fade)` : undefined}
      opacity={part.group?.tower ? 0.9 : 1}
    >{source}</g>;
  }

  return <div ref={environment} className={styles.environment} aria-hidden="true">
    <div className={styles.viewport}>
      <div className={styles.atmosphere}>
        <svg className={styles.artwork} viewBox={`0 0 ${SKYLINE_WIDTH} ${SKYLINE_HEIGHT}`} fill="none" focusable="false">
          <defs>
            {palette.map((fill) => <linearGradient id={gradientId(fill)} key={fill} x1="0" y1="0" x2="0.2" y2="1">
              <stop offset="0" stopColor={fill} stopOpacity="0.82" />
              <stop offset="0.62" stopColor={fill} />
              <stop offset="1" stopColor={fill} stopOpacity="0.92" />
            </linearGradient>)}
            <linearGradient id={`${uid}-ground-fade`} x1="0" y1="350" x2="0" y2="1514" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="white" />
              <stop offset="0.55" stopColor="white" stopOpacity="0.65" />
              <stop offset="1" stopColor="white" style={{ stopOpacity: "var(--skyline-ground-opacity, 0.9)" }} />
            </linearGradient>
            <mask id={`${uid}-tower-fade`} maskUnits="userSpaceOnUse" x="0" y="-50" width="2965" height="1650">
              <path d="M0 -50H2965V1600H0Z" fill={`url(#${uid}-ground-fade)`} />
            </mask>
            <linearGradient id={`${uid}-water-fade`} x1="0" y1={SKYLINE_BASELINE} x2="0" y2="2050" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="white" stopOpacity="0.75" />
              <stop offset="0.4" stopColor="white" stopOpacity="0.2" />
              <stop offset="1" stopColor="white" stopOpacity="0" />
            </linearGradient>
            <mask id={`${uid}-reflection-fade`} maskUnits="userSpaceOnUse" x="0" y="1514" width="2965" height="707">
              <path d="M0 1514H2965V2221H0Z" fill={`url(#${uid}-water-fade)`} />
            </mask>
          </defs>
          {SKYLINE_PARTS.slice(0, 98).map(renderPart)}
          <g data-reflections mask={`url(#${uid}-reflection-fade)`} opacity="0.35">
            {SKYLINE_PARTS.slice(98, 196).map(renderPart)}
          </g>
          {renderPart(SKYLINE_PARTS[196])}
        </svg>
      </div>
      <div className={styles.contentVeil} />
    </div>
  </div>;
}
