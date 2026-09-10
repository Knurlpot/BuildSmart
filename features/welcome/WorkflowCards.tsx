"use client";

import { useEffect, useRef, useState } from "react";
import { type LucideIcon } from "lucide-react";
import styles from "./welcome.module.css";

type Step = { title: string; text: string; icon: LucideIcon; number: string };
const clips = ["prices", "rules", "quotation"];

function WorkflowCard({ step, clip, active, motion, onOpen, onClose }: {
  step: Step; clip: string; active: boolean; motion: boolean;
  onOpen: () => void; onClose: () => void;
}) {
  const card = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const Icon = step.icon;

  useEffect(() => {
    const media = video.current;
    const element = card.current;
    if (!media || !element || !active) return;
    // Hover opens only with motion enabled; the button is an explicit play action.
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !document.hidden) void media.play().catch(() => undefined);
      else media.pause();
    }, { threshold: 0.25 });
    const hide = () => { if (document.hidden) media.pause(); };
    observer.observe(element);
    document.addEventListener("visibilitychange", hide);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", hide); media.pause(); };
  }, [active, motion]);

  return <article ref={card} className={styles.workflowCard} data-step={step.number} data-preview={active}
    onPointerEnter={(event) => { if (event.pointerType === "mouse" && motion) onOpen(); }}
    onPointerLeave={(event) => { if (event.pointerType === "mouse" && !event.currentTarget.contains(document.activeElement)) onClose(); }}
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) onClose(); }}
    onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
    <div id={`workflow-preview-${step.number}`} className={styles.workflowPreview} aria-hidden="true">
      <video ref={video} src={active && !failed ? `/welcome/workflow-${clip}.mp4` : undefined} poster={`/welcome/workflow-${clip}.jpg`} muted playsInline loop preload="none" onError={() => setFailed(true)} />
    </div>
    <span className={styles.workflowScrim} aria-hidden="true" />
    <span className={styles.workflowWash} aria-hidden="true" />
    <div className={styles.workflowCardTop}><span>{step.number}</span><Icon size={27} strokeWidth={1.4} /></div>
    <h3>{step.title}</h3><p>{step.text}</p>
    <button type="button" className={styles.previewToggle} aria-label={`${active ? "Pause" : "Play"} ${step.title} video`} aria-pressed={active} aria-controls={`workflow-preview-${step.number}`} onClick={() => active ? onClose() : onOpen()} />
    {failed && <span className={styles.previewError} role="status">Video unavailable</span>}
    <span className={styles.workflowLine} aria-hidden="true" />
  </article>;
}

export function WorkflowCards({ steps, motion }: { steps: Step[]; motion: boolean }) {
  const [active, setActive] = useState<string | null>(null);
  return <div className={styles.workflowGrid} data-reveal>{steps.map((step, index) => <WorkflowCard key={step.number} step={step} clip={clips[index]} active={active === step.number} motion={motion} onOpen={() => setActive(step.number)} onClose={() => setActive(current => current === step.number ? null : current)} />)}</div>;
}
