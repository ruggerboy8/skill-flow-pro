import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { BookOpen, Sparkles, PenLine, Send, X, ArrowLeft, ArrowRight } from "lucide-react";

/**
 * First-run guided tour for the Evaluation Capture screen. Purely additive: it
 * reads the bounding boxes of existing regions (by id) and paints a dimmed
 * overlay with a cut-out "spotlight" over each one in sequence, plus a floating
 * step card with Back / Next / Skip and a "Don't show this again" control.
 *
 * No new dependencies: the spotlight hole is a single div sized to the target,
 * dimmed via a very large box-shadow spread rather than an SVG mask.
 *
 * Persistence uses its own localStorage key so it is independent of the lighter
 * persistent "How this works" hint strip on the page.
 */

export const TOUR_DISMISSED_KEY = "evalCaptureTourDismissed";

type TourStep = {
  /** id of the element to spotlight; null = intro (centered, no target). */
  targetId: string | null;
  icon: React.ElementType;
  /** Optional accent color for the step icon (CSS color string). */
  accent?: string;
  title: string;
  body: string;
};

const STEPS: TourStep[] = [
  {
    targetId: null,
    icon: Sparkles,
    title: "Welcome to evaluation capture",
    body: "Here's how you'll give this team member feedback across their four domains. It takes about a minute to walk through. You can skip anytime.",
  },
  {
    targetId: "tour-rubric",
    icon: BookOpen,
    title: "Your rubric lives here",
    body: "The left side is your reference: what each domain and competency covers, and the Pro Moves to look for. Lean on it as you recall what you saw.",
  },
  {
    targetId: "tour-feedback",
    icon: Sparkles,
    title: "Say it naturally here",
    body: "Speak or type your feedback in Glow and Grow. Tap a starter if you'd like a nudge, then let us polish it and file it under the right competencies.",
  },
  {
    targetId: "tour-scores",
    icon: PenLine,
    title: "Score each competency",
    body: "Set a 1 to 4 score for every competency, or mark Did not observe. Notes sort in here automatically, and you can edit them directly.",
  },
  {
    targetId: "tour-submit",
    icon: Send,
    title: "Review and submit",
    body: "When all four domains are covered, open Review and submit. We'll flag anything missing before it goes to your central office.",
  },
];

const PADDING = 8; // spotlight breathing room around the target
const CARD_GAP = 14; // gap between spotlight and step card

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function CaptureTour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [dontShow, setDontShow] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const step = STEPS[stepIdx];
  const isFirst = stepIdx === 0;
  const isLast = stepIdx === STEPS.length - 1;

  // Reset to the first step whenever the tour (re)opens.
  useEffect(() => {
    if (open) {
      setStepIdx(0);
      setDontShow(false);
    }
  }, [open]);

  const measure = useCallback(() => {
    if (!step?.targetId) {
      setRect(null);
      return;
    }
    const el = document.getElementById(step.targetId);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step]);

  // Scroll the target into view, then measure it (and keep measuring on
  // resize/scroll so the spotlight tracks the element).
  useLayoutEffect(() => {
    if (!open) return;
    if (step?.targetId) {
      const el = document.getElementById(step.targetId);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    // Measure after the smooth scroll settles, plus an immediate pass.
    measure();
    const t = window.setTimeout(measure, 320);
    return () => window.clearTimeout(t);
  }, [open, step, measure]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, measure]);

  // Move focus into the card so keyboard users land in the tour.
  useEffect(() => {
    if (open) cardRef.current?.focus();
  }, [open, stepIdx]);

  const finish = useCallback(() => {
    if (dontShow) {
      try {
        localStorage.setItem(TOUR_DISMISSED_KEY, "1");
      } catch {
        /* ignore */
      }
    }
    onClose();
  }, [dontShow, onClose]);

  const next = useCallback(() => {
    if (isLast) finish();
    else setStepIdx((i) => Math.min(STEPS.length - 1, i + 1));
  }, [isLast, finish]);

  const back = useCallback(() => setStepIdx((i) => Math.max(0, i - 1)), []);

  // Keyboard: Esc to close, arrows for Back/Next.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        finish();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, next, back, finish]);

  if (!open) return null;

  const StepIcon = step.icon;

  // Spotlight hole geometry (clamped to the viewport).
  const hole = rect
    ? {
        top: Math.max(0, rect.top - PADDING),
        left: Math.max(0, rect.left - PADDING),
        width: rect.width + PADDING * 2,
        height: rect.height + PADDING * 2,
      }
    : null;

  // Position the step card: below the spotlight if there's room, otherwise
  // above it; centered when there's no target (intro/last fallback).
  let cardStyle: React.CSSProperties;
  if (hole) {
    const belowTop = hole.top + hole.height + CARD_GAP;
    const spaceBelow = window.innerHeight - belowTop;
    const placeBelow = spaceBelow > 220;
    cardStyle = placeBelow
      ? { top: belowTop, left: "50%", transform: "translateX(-50%)" }
      : { bottom: window.innerHeight - hole.top + CARD_GAP, left: "50%", transform: "translateX(-50%)" };
  } else {
    cardStyle = { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  }

  return (
    <div
      className="fixed inset-0 z-[60]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="capture-tour-title"
      aria-describedby="capture-tour-body"
    >
      {/* Dimmer + spotlight. When there's a hole, the dim is the hole's huge
          box-shadow; otherwise a plain full-screen scrim. Click the dim to skip. */}
      {hole ? (
        <div
          className="absolute rounded-xl ring-2 ring-white/70 transition-all duration-300 ease-out pointer-events-none"
          style={{
            top: hole.top,
            left: hole.left,
            width: hole.width,
            height: hole.height,
            boxShadow: "0 0 0 9999px hsl(222 47% 11% / 0.72)",
          }}
          aria-hidden
        />
      ) : (
        <div className="absolute inset-0" style={{ background: "hsl(222 47% 11% / 0.72)" }} aria-hidden />
      )}

      {/* Click-catcher to skip when tapping outside the card. Sits under the card. */}
      <button
        type="button"
        aria-label="Skip tutorial"
        className="absolute inset-0 cursor-default focus:outline-none"
        onClick={finish}
        tabIndex={-1}
      />

      {/* Step card */}
      <div
        ref={cardRef}
        tabIndex={-1}
        className="absolute w-[min(22rem,calc(100vw-2rem))] rounded-2xl border bg-background p-5 shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={cardStyle}
      >
        <button
          type="button"
          onClick={finish}
          aria-label="Close tutorial"
          className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3 pr-6">
          <span
            className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted"
            aria-hidden
          >
            <StepIcon className="h-5 w-5" style={step.accent ? { color: step.accent } : undefined} />
          </span>
          <div className="space-y-1.5">
            <p id="capture-tour-title" className="text-base font-semibold leading-tight">
              {step.title}
            </p>
            <p id="capture-tour-body" className="text-sm leading-relaxed text-muted-foreground">
              {step.body}
            </p>
          </div>
        </div>

        {/* Progress dots */}
        <div className="mt-4 flex items-center gap-1.5" aria-hidden>
          {STEPS.map((_, i) => (
            <span
              key={i}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: i === stepIdx ? 18 : 6,
                background: i === stepIdx ? "hsl(var(--primary))" : "hsl(var(--border))",
              }}
            />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-2xs text-muted-foreground">
            <input
              type="checkbox"
              checked={dontShow}
              onChange={(e) => setDontShow(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border accent-current"
            />
            Don't show this again
          </label>
          <div className="flex items-center gap-2">
            {!isFirst && (
              <Button variant="ghost" size="sm" onClick={back}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
            )}
            <Button size="sm" onClick={next}>
              {isLast ? (
                "Got it"
              ) : (
                <>
                  Next <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>

        <p className="mt-2 text-center text-2xs text-muted-foreground" aria-hidden>
          Step {stepIdx + 1} of {STEPS.length}
        </p>
      </div>
    </div>
  );
}
