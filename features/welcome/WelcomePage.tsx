"use client";

import Image from "next/image";
import Link from "next/link";
import { type MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, CircleHelp, FileText, Layers3, LockKeyhole, MapPin, MoveUpRight, Pause, Play, ScanLine, ShieldCheck, Sparkles } from "lucide-react";
import { logoFrame } from "@/components/logo-frames";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/AuthProvider";
import { useFetch } from "@/hooks/useFetch";
import { resolveOnboardingRoute } from "@/lib/onboarding";
import { useReducedMotion, useWelcomeMotion } from "./useWelcomeMotion";
import { SkylineBackground } from "./skyline/SkylineBackground";
import { WorkflowCards } from "./WorkflowCards";
import { PhilippineFlag } from "./PhilippineFlag";
import { BrickLogo } from "./BrickLogo";
import styles from "./welcome.module.css";

const workflow = [
  { title: "Your prices.", text: "Bring in supplier pricelists. Review normalized materials and choose the price sources you trust.", icon: FileText, number: "01" },
  { title: "Your way of building.", text: "Set material, labor, supplier, unit, and pricing rules that reflect how your company works.", icon: Layers3, number: "02" },
  { title: "A clearer quotation.", text: "Start with a blueprint or quick measurements. Review quantities and compare Practical and Premium options.", icon: ScanLine, number: "03" },
];
const featureDescriptions: Record<string, string> = {
  "/pricelist": "Keep supplier prices organized and review material matches.",
  "/management": "Make every estimate reflect your company’s way of working.",
  "/quotations/new": "Turn project measurements into a quotation you can review.",
  "/projects": "Pick up a quotation and keep client details close at hand.",
  "/market-intelligence": "Put material prices in context with available reference data.",
};
const team = [
  { name: "Knurl Randel B. Abasola", initials: "KA" },
  { name: "Emmanuel Christian E. Azarcon", initials: "EA" },
  { name: "Princess Daniella M. Chica", initials: "PC" },
  { name: "Matthew Aiman L. Lopez", initials: "ML" },
];

function BrandMark({ large = false }: { large?: boolean }) {
  return <span className={`${styles.brandMark} ${large ? styles.brandMarkLarge : ""}`} aria-hidden="true"><span className={styles.brandHalo} /><Image src={logoFrame(13)} alt="" className={styles.brandEcho} /><Image src={logoFrame(13)} alt="" className={styles.brandSymbol} priority={!large} /></span>;
}

function ArchitectureScene() {
  const [selected, setSelected] = useState<"house" | "building">("house");
  return <div className={styles.architectureScene}>
    <span className={styles.orbit} aria-hidden="true" /><span className={styles.orbitInner} aria-hidden="true" />
    <div className={styles.sceneCaption}><span /> A little vision. A better foundation.</div>
    <div className={`${styles.modelPosition} ${styles.buildingPosition}`}><button type="button" className={`${styles.modelButton} ${styles.buildingModel}`} onMouseEnter={() => setSelected("building")} onFocus={() => setSelected("building")} onClick={() => setSelected("building")} aria-label="Explore medium projects and Premium quotations" aria-pressed={selected === "building"} aria-describedby="architecture-description"><Image src="/welcome/building-glass.png" alt="Floating translucent blue glass building" width={640} height={640} priority className={styles.modelImage} /><span className={styles.modelTag}>Room to think bigger <ArrowUpRight size={12} /></span></button></div>
    <div className={`${styles.modelPosition} ${styles.housePosition}`}><button type="button" className={`${styles.modelButton} ${styles.houseModel}`} onMouseEnter={() => setSelected("house")} onFocus={() => setSelected("house")} onClick={() => setSelected("house")} aria-label="Explore small projects and economical Practical quotations" aria-pressed={selected === "house"} aria-describedby="architecture-description"><Image src="/welcome/house-glass.png" alt="Floating translucent amber orange glass house" width={640} height={640} priority className={styles.modelImage} /><span className={styles.modelTag}>Great things start small <ArrowUpRight size={12} /></span></button></div>
    <span className={styles.sceneSparkOne} aria-hidden="true">+</span><span className={styles.sceneSparkTwo} aria-hidden="true">+</span>
    <div id="architecture-description" className={`${styles.sceneDescription} ${selected === "building" ? styles.blueDescription : ""}`} aria-live="polite" aria-atomic="true"><span className={styles.descriptionDot} /><div><strong>{selected === "house" ? "Small projects. Thoughtful budgets." : "Bigger ideas. Premium possibilities."}</strong><p>{selected === "house" ? "Explore economical quotes with our Practical option." : "Explore medium projects with our Premium option."}</p></div></div>
    <span className={styles.sceneHint}>Hover, focus, or tap to explore</span>
  </div>;
}

function ConstructionFilm({ motion }: { motion: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [allowLoad, setAllowLoad] = useState(false);
  const [manuallyPaused, setManuallyPaused] = useState(false);
  useEffect(() => {
    const media = video.current;
    if (!media) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setAllowLoad(true);
        if (motion && !manuallyPaused) void media.play().catch(() => undefined);
      } else media.pause();
    }, { threshold: 0.2 });
    observer.observe(media);
    if (!motion) media.pause();
    return () => { observer.disconnect(); media.pause(); };
  }, [motion, manuallyPaused, allowLoad]);
  async function toggle() {
    if (!video.current) return;
    if (playing) { setManuallyPaused(true); video.current.pause(); }
    else { setAllowLoad(true); setManuallyPaused(false); try { await video.current.play(); } catch { /* Poster stays visible when autoplay is unavailable. */ } }
  }
  return <div className={styles.film}>
    <video ref={video} muted playsInline loop preload={allowLoad ? "metadata" : "none"} poster="/welcome/construction-poster.jpg" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setFailed(true)} aria-label="Silent cinematic montage of construction work" controls={failed}>{allowLoad && <source src="/welcome/construction-reel.mp4" type="video/mp4" />}</video>
    <span className={styles.filmShade} aria-hidden="true" /><div className={styles.filmTop}><span><span /> THE WORK BEHIND THE VISION</span><span>01 / FIELD NOTES</span></div><div className={styles.filmBottom}><p>Before the skyline,<br />there&apos;s a plan.</p><button type="button" onClick={toggle} aria-label={playing ? "Pause construction film" : "Play construction film"}>{playing ? <Pause size={20} /> : <Play size={20} />}</button></div>{failed && <p className={styles.filmError}>Film unavailable. You can still explore everything below.</p>}
  </div>;
}

interface Activity { activity_id: string; title: string; status: string; occurred_at: string }

function WorkspaceSection({ onboardingStep }: { onboardingStep: number }) {
  const complete = onboardingStep >= 2;
  const { data: activities, isLoading, error, refetch } = useFetch<Activity[]>(complete ? "/api/dashboard/activity" : null);
  return <section id="workspace" className={`${styles.workspace} ${styles.section}`}>
    <div className={styles.sectionHeading} data-reveal><div><p className={styles.eyebrow}><span /> YOUR NEXT CHAPTER</p><h2>Let&apos;s put it<br /><span>into practice.</span></h2></div><p>You bring the vision. Your BuildSmart workspace brings the prices, preferences, and project details together.</p></div>
    {!complete && <div className={styles.setupBanner} data-reveal><div className={styles.setupNumber}>{Math.min(onboardingStep, 2)}<span>/2</span></div><div><h3>A strong foundation comes first.</h3><p>{onboardingStep === 0 ? "Add your pricelist, then configure your company’s rules to unlock quotations." : "Your pricelist is ready. Set up your company’s preferences and rules next."}</p><div className={styles.setupSteps}><span><Check size={13} /> Account created</span><span data-complete={onboardingStep >= 1}>1. Pricelist</span><span>2. Company rules</span></div></div><Link href={resolveOnboardingRoute(onboardingStep)} className={styles.primaryButton}>{onboardingStep === 0 ? "Set up pricelist" : "Set up rules"}<ArrowUpRight size={17} /></Link></div>}
    <div className={styles.tools} data-reveal>{NAV_ITEMS.map((item, index) => {
      const locked = onboardingStep < item.minStep;
      const Icon = item.icon;
      return <Link className={styles.tool} href={locked ? resolveOnboardingRoute(onboardingStep) : item.href} key={item.href} aria-label={locked ? `${item.label}: complete setup to unlock` : item.label}><div className={styles.toolTop}><Icon size={23} strokeWidth={1.5} /><span>0{index + 1}</span></div><h3>{item.label}</h3><p>{featureDescriptions[item.href]}</p><span className={styles.toolAction}>{locked ? <><LockKeyhole size={13} /> Complete setup</> : <>Open tool <ArrowUpRight size={15} /></>}</span></Link>;
    })}</div>
    {complete && <div className={styles.recentWork} data-reveal><div><span className={styles.eyebrow}>PICK UP WHERE YOU LEFT OFF</span><h3>Recent quotations</h3></div><div className={styles.recentList} aria-live="polite">{isLoading ? <p>Loading your recent work…</p> : error ? <p>Recent work couldn&apos;t be loaded. <button onClick={refetch}>Try again</button></p> : activities?.length ? activities.slice(0, 3).map((activity) => { const date = new Date(activity.occurred_at); return <Link href={`/quotations/${activity.activity_id}`} key={activity.activity_id}><FileText size={18} /><strong>{activity.title}</strong><span>{activity.status}</span><time dateTime={Number.isNaN(date.getTime()) ? undefined : date.toISOString()}>{Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-PH", { month: "short", day: "numeric" })}</time><ArrowUpRight size={16} /></Link>; }) : <p>Your next build starts here. <Link href="/quotations/new">Create your first quotation <ArrowUpRight size={14} /></Link></p>}</div></div>}
  </section>;
}

export function WelcomePage() {
  const { currentUser } = useAuth();
  const root = useRef<HTMLDivElement>(null);
  const scrollAnimation = useRef<number | null>(null);
  const reducedMotion = useReducedMotion();
  const motion = !reducedMotion;
  const onboardingStep = currentUser?.onboardingStep ?? 0;
  const ready = onboardingStep >= 2;
  const firstName = currentUser?.first_name?.trim() || currentUser?.email?.split("@")[0] || "builder";
  useWelcomeMotion(root, motion);
  useEffect(() => () => {
    if (scrollAnimation.current !== null) cancelAnimationFrame(scrollAnimation.current);
  }, []);

  function handlePageAnchorClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!(event.target instanceof Element)) return;

    const link = event.target.closest<HTMLAnchorElement>('a[href^="#"]');
    if (!link || !event.currentTarget.contains(link)) return;

    const hash = link.getAttribute("href");
    if (!hash || hash === "#") return;

    const target = document.getElementById(decodeURIComponent(hash.slice(1)));
    if (!target) return;

    event.preventDefault();
    if (scrollAnimation.current !== null) cancelAnimationFrame(scrollAnimation.current);

    const scrollMargin = Number.parseFloat(window.getComputedStyle(target).scrollMarginTop) || 0;
    const maximumScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const destination = Math.min(maximumScroll, Math.max(0, window.scrollY + target.getBoundingClientRect().top - scrollMargin));
    const start = window.scrollY;
    const distance = destination - start;

    if (window.location.hash !== hash) window.history.pushState(null, "", hash);

    if (!motion || Math.abs(distance) < 2) {
      window.scrollTo({ top: destination });
      scrollAnimation.current = null;
      return;
    }

    const duration = Math.min(560, Math.max(280, Math.abs(distance) * 0.18));
    const startedAt = performance.now();
    const animate = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      window.scrollTo({ top: start + distance * eased });
      if (progress < 1) scrollAnimation.current = requestAnimationFrame(animate);
      else scrollAnimation.current = null;
    };
    scrollAnimation.current = requestAnimationFrame(animate);
  }

  return <div ref={root} className={styles.welcome} data-motion={motion ? "on" : "off"} onClick={handlePageAnchorClick}>
    <SkylineBackground page={root} enabled={motion} />
    <a className={styles.skipLink} href="#welcome-content">Skip to welcome content</a>
    <main id="welcome-content">
      <section className={styles.hero} id="welcome"><div className={styles.heroMesh} aria-hidden="true" /><div className={styles.heroGrid} aria-hidden="true" /><div className={styles.heroInner}><div className={styles.heroCopy}>
        <p className={styles.welcomeBack}><span /> Welcome to your next great build, {firstName}.</p>
        <h1>Big visions.<br />Smarter plans.<br /><span>Better builds.</span></h1>
        <p className={styles.heroDescription}>From a first home to a growing skyline. BuildSmart helps you turn project ideas into clearer, more confident construction quotations.</p>
        <div className={styles.heroActions}><Button asChild size="lg" className="h-14 max-w-full gap-4 px-7 text-base font-semibold shadow-sm whitespace-normal"><Link href={ready ? "/quotations/new" : resolveOnboardingRoute(onboardingStep)}>{ready ? "Create new project" : "Set up your workspace"}<ArrowUpRight size={20} /></Link></Button><a href="#our-story" className={styles.textButton}>Meet BuildSmart <ArrowRight size={16} /></a></div>
        <p className={styles.heroNote}><ShieldCheck size={14} /> AI-assisted. Built around your judgment.</p>
      </div><ArchitectureScene /></div><div className={styles.heroFoot}><span><MapPin size={13} /> ROOTED IN THE PHILIPPINES</span><a href="#how-it-works">SCROLL TO DISCOVER <ArrowDown size={14} /></a><span>BUILT FOR WHAT&apos;S NEXT</span></div></section>

      <section id="how-it-works" className={`${styles.workflow} ${styles.section}`}><div className={styles.sectionHeading} data-reveal><div><p className={styles.eyebrow}><span /> FROM VISION TO QUOTATION</p><h2>A little less guesswork.<br /><span>A lot more clarity.</span></h2></div><p>One connected process for the details that matter. Your inputs lead the way, and you stay in control of the final call.</p></div><WorkflowCards steps={workflow} motion={motion} /><p className={styles.tierNote}><CircleHelp size={14} /> Practical and Premium are quotation options, not limits on your project&apos;s size.</p></section>

      <section id="our-story" className={`${styles.story} ${styles.section}`}><div className={styles.storyVisual} data-reveal><ConstructionFilm motion={motion} /><span className={styles.filmFootnote}>A closer look at the world we&apos;re building for.</span></div><div className={styles.storyCopy} data-reveal><p className={styles.eyebrow}><span /> OUR STORY</p><h2>Made for the people<br />who <span>make things happen.</span></h2><p className={styles.storyLead}>Behind every building is someone making hundreds of decisions. We believe the numbers should make that work easier.</p><p>BuildSmart began as a capstone project at the Polytechnic University of the Philippines, inspired by a familiar challenge: preparing construction quotations while material prices keep changing.</p><p>We bring company rules, supplier prices, and project measurements into one place, so contractors and estimators can spend less time piecing things together and more time moving a project forward.</p><div className={styles.storySignature}><PhilippineFlag /><span>Philippine roots.<br /><strong>A practical purpose.</strong></span></div></div></section>

      <section className={styles.principle}><div className={styles.principleMesh} aria-hidden="true" /><div className={styles.principleInner} data-reveal><BrickLogo motion={motion} className={styles.brandMarkLarge} /><div><p className={styles.eyebrow}>A SMARTER ASSIST. A HUMAN DECISION.</p><h2>Your expertise.<br /><span>Always at the center.</span></h2><p>AI can help organize the details. Your experience gives them meaning. Review the measurements, check the sources, and make the final quotation your own.</p><div className={styles.trustPills}><span><ScanLine size={15} /> Reviewable quantities</span><span><ShieldCheck size={15} /> Visible price sources</span><span><Sparkles size={15} /> Your company rules</span></div></div></div></section>

      <section id="the-team" className={`${styles.teamSection} ${styles.section}`}><div className={styles.sectionHeading} data-reveal><div><p className={styles.eyebrow}><span /> THE PEOPLE BEHIND BUILDSMART</p><h2>Four minds.<br /><span>One shared blueprint.</span></h2></div><p>A student-built project with a shared ambition: make construction estimating more useful for the people doing the work.</p></div><div className={styles.teamGrid} data-reveal>{team.map((member, index) => <article key={member.initials} className={styles.teamCard}><div className={styles.teamMonogram} aria-hidden="true"><span>{member.initials}</span><span className={styles.teamIndex}>0{index + 1}</span></div><h3>{member.name}</h3><p>BuildSmart project team</p></article>)}</div><p className={styles.university}><MapPin size={14} /> Polytechnic University of the Philippines</p></section>

      <WorkspaceSection onboardingStep={onboardingStep} />
      <section className={styles.closing}><div className={styles.closingGlow} aria-hidden="true" /><span className={styles.eyebrow}>THE NEXT GREAT BUILD STARTS WITH YOU</span><h2>Let&apos;s build<br /><span>something better.</span></h2><Link href={ready ? "/quotations/new" : resolveOnboardingRoute(onboardingStep)} className={styles.primaryButton}>{ready ? "Create a quotation" : "Continue company setup"}<MoveUpRight size={18} /></Link><a className={styles.backToTop} href="#welcome">Back to the top <ArrowUpRight size={14} /></a></section>
    </main>
    <footer className={styles.footer}><a href="#welcome" className={styles.wordmark}><BrandMark /><span>Build<span>Smart</span></span></a><p>Smarter estimates. Fairer prices. Better builds.</p><span>© {new Date().getFullYear()} BuildSmart</span></footer>
  </div>;
}
