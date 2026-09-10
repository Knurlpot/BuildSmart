"use client";

import { useEffect, useId, useRef, type RefObject } from "react";
import { SKYLINE_BASELINE, SKYLINE_GROUPS, SKYLINE_HEIGHT, SKYLINE_PARTS, SKYLINE_WIDTH, sampleBuilding, sampleSkylineScene } from "./skyline-motion";
import styles from "./skyline.module.css";

// Decorative construction activity, anchored to two source rooftops. These
// inherit their building's scroll transform; only the cable/load animate locally.
function TowerCrane({ right = false }: { right?: boolean }) {
  return <g className={`${styles.crane} ${right ? styles.craneRight : ""}`} transform={right ? "translate(2650 421)" : "translate(495 250)"}>
    <path d="M-5 0V-84H5V0M-5-20 5-34-5-48 5-62-5-76M-38-70H108V-78H-38ZM-32-70-20-78-8-70 4-78 16-70 28-78 40-70 52-78 64-70 76-78 88-70 100-78M0-84 0-105 96-78M0-105-32-78" />
    <rect x="-34" y="-69" width="16" height="10" rx="1" fill="#e8c79e" />
    <rect x="5" y="-70" width="13" height="11" rx="1" fill="#fff6e5" />
    <g transform="translate(78 -70)">
      <line className={styles.hoistCable} x1="0" y1="0" x2="0" y2="184" />
      <g className={styles.hoistLoad}>
        <path d="M0 0V5M-14 13 0 5 14 13" />
        <rect x="-14" y="13" width="28" height="15" rx="1" fill="#fff6e5" />
        <path d="M-16 30H16M-6 13V28M6 13V28" />
      </g>
    </g>
  </g>;
}

export function SkylineBackground({ page, enabled }: { page: RefObject<HTMLDivElement | null>; enabled: boolean }) {
  const environment = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/:/g, "");

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
    const foregroundClip = container.querySelector<SVGRectElement>("[data-foreground-clip]");
    const footer = welcome.querySelector("footer");
    const header = welcome.querySelector("header");
    let frame = 0;
    let pageTop = 0;
    let scrollRange = 1;
    let viewportWidth = window.innerWidth;
    let introOffset = 0;

    const paint = () => {
      frame = 0;
      const progress = (window.scrollY - pageTop) / scrollRange;
      const scene = sampleSkylineScene(progress, viewportWidth, !enabled);
      container.style.setProperty("--skyline-atmosphere", String(scene.atmosphere));
      container.style.setProperty("--skyline-ground-opacity", String(scene.groundOpacity));
      container.style.setProperty("--skyline-intro-offset", `${introOffset * scene.introPlacement}px`);
      container.dataset.scrollProgress = scene.progress.toFixed(3);
      water?.setAttribute("opacity", String(scene.reflection * 0.5));
      baseline?.setAttribute("opacity", String(scene.foreground * 0.65));
      // Reveal solid foreground silhouettes geometrically; alpha per building
      // would expose the buildings underneath during the transition.
      foregroundClip?.setAttribute("y", String(1540 - scene.foreground * 650));

      for (const { group, parts } of groups) {
        const state = sampleBuilding(group, scene);
        for (const part of parts) {
          const y = part.dataset.reflection === "true" ? state.reflectedY : state.y;
          part.setAttribute("transform", `translate(${state.x.toFixed(3)} ${y.toFixed(3)})`);
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
      const artWidth = Math.max(viewportWidth, 760);
      const footerHeight = footer?.getBoundingClientRect().height ?? 84;
      const headerHeight = header?.getBoundingClientRect().height ?? 88;
      const naturalTop = window.innerHeight - footerHeight - artWidth * SKYLINE_BASELINE / SKYLINE_WIDTH;
      const rooftopTop = headerHeight + Math.min(140, window.innerHeight * 0.16);
      introOffset = Math.max(0, rooftopTop - naturalTop);
      container.style.setProperty("--skyline-art-width", `${artWidth}px`);
      container.style.setProperty("--skyline-footer-height", `${footerHeight}px`);
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
    const path = <path d={part.d} fill={part.fill} />;
    const source = part.grouped
      ? <g>{path}</g>
      : path;
    return <g
      key={part.sourceIndex}
      data-source-index={part.sourceIndex}
      data-building={part.group?.id}
      data-reflection={part.reflection ? "true" : undefined}
      data-baseline={part.sourceIndex === 196 ? "true" : undefined}
      clipPath={part.group && !part.group.tower ? `url(#${uid}-${part.reflection ? "reflected-foreground" : "foreground"}-reveal)` : undefined}
    >{source}{part.sourceIndex === 2 && <TowerCrane />}{part.sourceIndex === 17 && <TowerCrane right />}</g>;
  }

  return <div ref={environment} className={styles.environment} data-crane-motion={enabled ? "on" : "off"} aria-hidden="true">
    <div className={styles.viewport}>
      <div className={styles.atmosphere}>
        <svg className={styles.artwork} viewBox={`0 0 ${SKYLINE_WIDTH} ${SKYLINE_HEIGHT}`} fill="none" focusable="false">
          <defs>
            <clipPath id={`${uid}-foreground-reveal`} clipPathUnits="userSpaceOnUse">
              <rect data-foreground-clip x="0" y="890" width="2965" height="1500" />
            </clipPath>
            <clipPath id={`${uid}-reflected-foreground-reveal`} clipPathUnits="userSpaceOnUse">
              <rect x="0" y="1514" width="2965" height="707" />
            </clipPath>
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
          {/* Mask after compositing: solid front buildings fully occlude those behind. */}
          <g mask={`url(#${uid}-tower-fade)`}>
            {SKYLINE_PARTS.slice(0, 98).map(renderPart)}
          </g>
          <g data-reflections mask={`url(#${uid}-reflection-fade)`} opacity="0.35">
            {SKYLINE_PARTS.slice(98, 196).map(renderPart)}
          </g>
          {renderPart(SKYLINE_PARTS[196])}
        </svg>
      </div>
    </div>
  </div>;
}
