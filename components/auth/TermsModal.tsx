"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { TERMS_AND_CONDITIONS } from "@/lib/legal/termsContent";

// Each wheel tick moves this many times further than the browser default, so
// users can move through the document quickly. Scrollbar drag / keyboard
// scrolling are untouched — only the wheel handler is intercepted.
const SCROLL_SPEED_MULTIPLIER = 2.5;
const BOTTOM_THRESHOLD_PX = 4;

interface TermsModalProps {
  onClose: () => void;
  onAgree: () => void;
}

function parseInline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter((p) => p.length > 0);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

// Minimal markdown-to-JSX renderer scoped to exactly the constructs used in
// termsContent.ts (#/##/### headers, ---, "- " bullets, "1. " numbered
// lists, inline **bold**). Not a general-purpose markdown parser.
function renderTermsContent(markdown: string): ReactNode[] {
  const rawLines = markdown.replace(/\r\n/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let key = 0;
  let paragraphBuf: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuf.length === 0) return;
    const text = paragraphBuf.join(" ").trim();
    paragraphBuf = [];
    if (!text) return;
    nodes.push(
      <p key={key++} className="mb-3 leading-relaxed text-gray-700">
        {parseInline(text)}
      </p>
    );
  };

  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i].trim();

    if (line === "") {
      flushParagraph();
      i++;
      continue;
    }

    if (line === "---") {
      flushParagraph();
      nodes.push(<hr key={key++} className="my-5 border-gray-200" />);
      i++;
      continue;
    }

    if (line.startsWith("### ")) {
      flushParagraph();
      nodes.push(
        <h3 key={key++} className="mb-1.5 mt-4 text-sm font-bold text-gray-900">
          {parseInline(line.slice(4))}
        </h3>
      );
      i++;
      continue;
    }

    if (line.startsWith("## ")) {
      flushParagraph();
      nodes.push(
        <h2 key={key++} className="mb-2 mt-5 text-base font-extrabold text-gray-900">
          {parseInline(line.slice(3))}
        </h2>
      );
      i++;
      continue;
    }

    if (line.startsWith("# ")) {
      flushParagraph();
      nodes.push(
        <h1 key={key++} className="mb-3 text-lg font-extrabold text-gray-900">
          {parseInline(line.slice(2))}
        </h1>
      );
      i++;
      continue;
    }

    if (line.startsWith("- ")) {
      flushParagraph();
      const items: string[] = [];
      while (i < rawLines.length && rawLines[i].trim().startsWith("- ")) {
        items.push(rawLines[i].trim().slice(2));
        i++;
      }
      nodes.push(
        <ul key={key++} className="mb-3 ml-5 list-disc space-y-1 text-gray-700">
          {items.map((it, idx) => (
            <li key={idx}>{parseInline(it)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      flushParagraph();
      const items: string[] = [];
      while (i < rawLines.length && /^\d+\.\s/.test(rawLines[i].trim())) {
        items.push(rawLines[i].trim().replace(/^\d+\.\s/, ""));
        i++;
      }
      nodes.push(
        <ol key={key++} className="mb-3 ml-5 list-decimal space-y-1 text-gray-700">
          {items.map((it, idx) => (
            <li key={idx}>{parseInline(it)}</li>
          ))}
        </ol>
      );
      continue;
    }

    paragraphBuf.push(line);
    i++;
  }
  flushParagraph();

  return nodes;
}

const TERMS_NODES = renderTermsContent(TERMS_AND_CONDITIONS);

// Parent mounts this component only while the modal should be visible, so
// each open is a fresh mount — state (like reachedBottom) starts clean
// without needing to be reset imperatively inside an effect.
export function TermsModal({ onClose, onAgree }: TermsModalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [reachedBottom, setReachedBottom] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Content short enough to not need scrolling shouldn't block on a
    // scroll gesture that isn't possible to perform.
    if (el.scrollHeight - el.clientHeight <= BOTTOM_THRESHOLD_PX) {
      setReachedBottom(true);
    }
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // React attaches onWheel as a passive listener by default, so
    // preventDefault() there is silently ignored — the multiplier requires a
    // manually-attached native listener instead.
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      el.scrollTop += e.deltaY * SCROLL_SPEED_MULTIPLIER;
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_THRESHOLD_PX) {
      setReachedBottom(true);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Terms and Conditions"
    >
      <div
        className="flex w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl"
        style={{ maxHeight: "85vh" }}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-bold text-gray-900">Terms and Conditions</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-gray-300 transition hover:text-gray-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-6 py-5 text-sm"
        >
          {TERMS_NODES}
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-gray-100 px-6 py-4">
          <p className="text-xs text-gray-400">
            {reachedBottom ? "You've reached the end." : "Scroll to the bottom to continue."}
          </p>
          <button
            type="button"
            disabled={!reachedBottom}
            onClick={() => {
              onAgree();
              onClose();
            }}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-(--primary-hover) disabled:cursor-not-allowed disabled:opacity-40"
          >
            I Agree
          </button>
        </div>
      </div>
    </div>
  );
}
