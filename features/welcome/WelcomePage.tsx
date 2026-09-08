"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, CircleHelp, Compass, FileText, Layers3, LockKeyhole, LogOut, MapPin, Menu, MoveUpRight, Pause, Play, ScanLine, ShieldCheck, Sparkles, UserRound, X } from "lucide-react";
import { logoFrame } from "@/components/logo-frames";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/AuthProvider";
import { useFetch } from "@/hooks/useFetch";
import { resolveOnboardingRoute } from "@/lib/onboarding";
import { useReducedMotion, useWelcomeMotion } from "./useWelcomeMotion";
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

function WelcomeNav({ motion, reducedMotion, onToggleMotion }: { motion: boolean; reducedMotion: boolean; onToggleMotion: () => void }) {
  const { currentUser, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const router = useRouter();
  const navigation = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !navigation.current?.contains(event.target)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); menuButton.current?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  async function signOut() {
    setLoggingOut(true); setLogoutError("");
    try { await logout(); router.push("/login"); }
    catch { setLogoutError("Could not sign out. Please try again."); setLoggingOut(false); }
  }
  return <header ref={navigation} className={styles.header}>
    <div className={styles.navInner}>
      <a className={styles.wordmark} href="#welcome" aria-label="BuildSmart welcome"><BrandMark /><span>Build<span>Smart</span></span></a>
      <nav className={styles.desktopNav} aria-label="Welcome page"><a href="#how-it-works">How it works</a><a href="#our-story">Our story</a><a href="#the-team">The team</a></nav>
      <div className={styles.navActions}>
        <button className={styles.motionToggle} type="button" onClick={onToggleMotion} disabled={reducedMotion} aria-label={reducedMotion ? "Motion disabled by your device preference" : motion ? "Pause page animations" : "Resume page animations"} aria-pressed={!motion} title={reducedMotion ? "Reduced motion is enabled on your device" : motion ? "Pause animations" : "Resume animations"}>{motion ? <Pause size={15} /> : <Play size={15} />}</button>
        <a href="#workspace" className={styles.navWorkspace}>Your workspace <ArrowUpRight size={15} /></a>
        <button ref={menuButton} type="button" className={styles.menuButton} onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="welcome-menu" aria-label={open ? "Close account and navigation menu" : "Open account and navigation menu"}>{open ? <X size={20} /> : <Menu size={20} />}</button>
      </div>
    </div>
    {open && <div className={styles.menuPanel} id="welcome-menu"><p className={styles.menuGreeting}>Signed in as <strong>{currentUser?.first_name || currentUser?.email || "BuildSmart user"}</strong></p><nav aria-label="Account and page navigation">
      <a href="#how-it-works" onClick={() => setOpen(false)}>How it works <ArrowUpRight size={16} /></a><a href="#our-story" onClick={() => setOpen(false)}>Our story <ArrowUpRight size={16} /></a><a href="#the-team" onClick={() => setOpen(false)}>The team <ArrowUpRight size={16} /></a><a href="#workspace" onClick={() => setOpen(false)}>Your workspace <Compass size={16} /></a><Link href="/account">My profile<UserRound size={16} /></Link><button type="button" onClick={signOut} disabled={loggingOut}>{loggingOut ? "Signing out…" : "Log out"}<LogOut size={16} /></button>
    </nav>{logoutError && <p role="alert" className={styles.menuError}>{logoutError}</p>}</div>}
    <span className={styles.readingProgress} data-reading-progress />
  </header>;
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

function ManilaSkyline() {
  return <div className={styles.skyline} data-skyline role="img" aria-label="Manila skyline, reproduced from your supplied illustration"><div className={`${styles.cityLayer} ${styles.cityBack}`} aria-hidden="true" /><div className={`${styles.cityLayer} ${styles.cityLeft}`} aria-hidden="true" /><div className={`${styles.cityLayer} ${styles.cityCenter}`} aria-hidden="true" /><div className={`${styles.cityLayer} ${styles.cityRight}`} aria-hidden="true" /><div className={styles.cityHaze} aria-hidden="true" /></div>;
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
  const reducedMotion = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const motion = !reducedMotion && !paused;
  const onboardingStep = currentUser?.onboardingStep ?? 0;
  const ready = onboardingStep >= 2;
  const firstName = currentUser?.first_name?.trim() || currentUser?.email?.split("@")[0] || "builder";
  useWelcomeMotion(root, motion);
  return <div ref={root} className={styles.welcome} data-motion={motion ? "on" : "off"}>
    <a className={styles.skipLink} href="#welcome-content">Skip to welcome content</a>
    <WelcomeNav motion={motion} reducedMotion={reducedMotion} onToggleMotion={() => setPaused(!paused)} />
    <main id="welcome-content">
      <section className={styles.hero} id="welcome"><div className={styles.heroMesh} aria-hidden="true" /><div className={styles.heroGrid} aria-hidden="true" /><div className={styles.heroInner}><div className={styles.heroCopy}>
        <p className={styles.welcomeBack}><span /> Welcome to your next great build, {firstName}.</p>
        <h1>Big visions.<br />Smarter plans.<br /><span>Better builds.</span></h1>
        <p className={styles.heroDescription}>From a first home to a growing skyline. BuildSmart helps you turn project ideas into clearer, more confident construction quotations.</p>
        <div className={styles.heroActions}><Button asChild className={styles.primaryButton}><Link href={ready ? "/quotations/new" : resolveOnboardingRoute(onboardingStep)}>{ready ? "Start a quotation" : "Set up your workspace"}<ArrowUpRight size={18} /></Link></Button><a href="#our-story" className={styles.textButton}>Meet BuildSmart <ArrowRight size={16} /></a></div>
        <p className={styles.heroNote}><ShieldCheck size={14} /> AI-assisted. Built around your judgment.</p>
      </div><ArchitectureScene /></div><ManilaSkyline /><div className={styles.heroFoot}><span><MapPin size={13} /> ROOTED IN THE PHILIPPINES</span><a href="#how-it-works">SCROLL TO DISCOVER <ArrowDown size={14} /></a><span>BUILT FOR WHAT&apos;S NEXT</span></div></section>

      <section id="how-it-works" className={`${styles.workflow} ${styles.section}`}><div className={styles.sectionHeading} data-reveal><div><p className={styles.eyebrow}><span /> FROM VISION TO QUOTATION</p><h2>A little less guesswork.<br /><span>A lot more clarity.</span></h2></div><p>One connected process for the details that matter. Your inputs lead the way, and you stay in control of the final call.</p></div><div className={styles.workflowGrid} data-reveal>{workflow.map(({ title, text, icon: Icon, number }) => <article key={number} className={styles.workflowCard}><div className={styles.workflowCardTop}><span>{number}</span><Icon size={27} strokeWidth={1.4} /></div><h3>{title}</h3><p>{text}</p><span className={styles.workflowLine} aria-hidden="true" /></article>)}</div><p className={styles.tierNote}><CircleHelp size={14} /> Practical and Premium are quotation options, not limits on your project&apos;s size.</p></section>

      <section id="our-story" className={`${styles.story} ${styles.section}`}><div className={styles.storyVisual} data-reveal><ConstructionFilm motion={motion} /><span className={styles.filmFootnote}>A closer look at the world we&apos;re building for.</span></div><div className={styles.storyCopy} data-reveal><p className={styles.eyebrow}><span /> OUR STORY</p><h2>Made for the people<br />who <span>make things happen.</span></h2><p className={styles.storyLead}>Behind every building is someone making hundreds of decisions. We believe the numbers should make that work easier.</p><p>BuildSmart began as a capstone project at the Polytechnic University of the Philippines, inspired by a familiar challenge: preparing construction quotations while material prices keep changing.</p><p>We bring company rules, supplier prices, and project measurements into one place, so contractors and estimators can spend less time piecing things together and more time moving a project forward.</p><div className={styles.storySignature}><BrandMark /><span>Philippine roots.<br /><strong>A practical purpose.</strong></span></div></div></section>

      <section className={styles.principle}><div className={styles.principleMesh} aria-hidden="true" /><div className={styles.principleInner} data-reveal><BrandMark large /><div><p className={styles.eyebrow}>A SMARTER ASSIST. A HUMAN DECISION.</p><h2>Your expertise.<br /><span>Always at the center.</span></h2><p>AI can help organize the details. Your experience gives them meaning. Review the measurements, check the sources, and make the final quotation your own.</p><div className={styles.trustPills}><span><ScanLine size={15} /> Reviewable quantities</span><span><ShieldCheck size={15} /> Visible price sources</span><span><Sparkles size={15} /> Your company rules</span></div></div></div></section>

      <section id="the-team" className={`${styles.teamSection} ${styles.section}`}><div className={styles.sectionHeading} data-reveal><div><p className={styles.eyebrow}><span /> THE PEOPLE BEHIND BUILDSMART</p><h2>Four minds.<br /><span>One shared blueprint.</span></h2></div><p>A student-built project with a shared ambition: make construction estimating more useful for the people doing the work.</p></div><div className={styles.teamGrid} data-reveal>{team.map((member, index) => <article key={member.initials} className={styles.teamCard}><div className={styles.teamMonogram} aria-hidden="true"><span>{member.initials}</span><span className={styles.teamIndex}>0{index + 1}</span></div><h3>{member.name}</h3><p>BuildSmart project team</p></article>)}</div><p className={styles.university}><MapPin size={14} /> Polytechnic University of the Philippines</p></section>

      <WorkspaceSection onboardingStep={onboardingStep} />
      <section className={styles.closing}><div className={styles.closingGlow} aria-hidden="true" /><span className={styles.eyebrow}>THE NEXT GREAT BUILD STARTS WITH YOU</span><h2>Let&apos;s build<br /><span>something better.</span></h2><Link href={ready ? "/quotations/new" : resolveOnboardingRoute(onboardingStep)} className={styles.primaryButton}>{ready ? "Create a quotation" : "Continue company setup"}<MoveUpRight size={18} /></Link><a className={styles.backToTop} href="#welcome">Back to the top <ArrowUpRight size={14} /></a></section>
    </main>
    <footer className={styles.footer}><a href="#welcome" className={styles.wordmark}><BrandMark /><span>Build<span>Smart</span></span></a><p>Smarter estimates. Fairer prices. Better builds.</p><span>© {new Date().getFullYear()} BuildSmart</span></footer>
  </div>;
}
