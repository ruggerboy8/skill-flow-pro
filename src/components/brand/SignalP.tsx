import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  SIGNAL_P_STEM,
  SIGNAL_P_GEOMETRY,
  BRAND_EASE,
  buildForSize,
  getBowlPathD,
  getDotRestPoint,
  getLapPoint,
} from '@/lib/signalPGeometry';

/**
 * The Signal P mark, per promoves-brand/exports/README.md and the motion
 * contract there. Structure and dot are independent SVG layers -- never
 * flatten them (id'd as data-testid for the same reason mark-side files use
 * #signal-p-structure / #signal-p-dot).
 *
 * Modes:
 * - 'static': renders the mark at rest. No animation, ever.
 * - 'once': runs one lap on mount (release -> lap -> deceleration -> drawn
 *   home), then rests. For brand moments.
 * - 'waiting': for indeterminate loading. The contract forbids continuous
 *   looping, so this runs discrete complete laps with a rest pause between
 *   them -- see docs/dev/motion-rules.md for why this reading of the
 *   contract was chosen.
 *
 * prefers-reduced-motion: reduce forces the static mark in every mode, no
 * lap ever.
 *
 * Colors come from the brand CSS vars only (never hardcoded hex): structure
 * is navy on light grounds / bone on dark grounds (`variant="dark"`), the
 * dot is always signal blue.
 */

export type SignalPMode = 'static' | 'once' | 'waiting';
export type SignalPVariant = 'light' | 'dark';

export interface SignalPProps {
  /** Rendered size in px (square, viewBox is always 100x100). Sizes <=24px use the kit's icon build automatically. Default 48. */
  size?: number;
  /** Animation behavior. Default 'static'. */
  mode?: SignalPMode;
  /** Structure color: 'light' = navy (default, for light grounds), 'dark' = bone (for dark grounds, e.g. the charcoal soundstage). */
  variant?: SignalPVariant;
  /** One lap's duration in ms. Default 1000 (--duration-brand). Contract range is 800-1200ms; stay inside it. */
  duration?: number;
  className?: string;
  /**
   * Accessible label. When set (or when `mode` is 'waiting', which defaults
   * to "Loading"), the mark is exposed as a status region. Omit for a
   * decorative use (e.g. alongside its own visible "Loading..." text) to
   * avoid double-announcing.
   */
  label?: string | null;
}

/** Discrete-lap "waiting" convention: rest at home this long between laps. See docs/dev/motion-rules.md. */
const WAITING_REST_PAUSE_MS = 1500;

/** Outward radial lift peak, in the mark's own units (~2u per the motion contract). */
const RADIAL_LIFT_MAX = 2;

function usePrefersReducedMotion(): boolean {
  const getSnapshot = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  const [reduced, setReduced] = useState(getSnapshot);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

export function SignalP({
  size = 48,
  mode = 'static',
  variant = 'light',
  duration = 1000,
  className,
  label,
}: SignalPProps) {
  const build = buildForSize(size);
  const geo = SIGNAL_P_GEOMETRY[build];
  const rest = getDotRestPoint(build);
  const bowlPathD = getBowlPathD(build);
  const dotRef = useRef<SVGCircleElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const shouldAnimate = mode !== 'static' && !prefersReducedMotion;

  const structureColor = variant === 'dark' ? 'hsl(var(--brand-bone))' : 'hsl(var(--brand-navy))';
  const dotColor = 'hsl(var(--brand-signal))';

  useEffect(() => {
    if (!shouldAnimate) return;
    const dot = dotRef.current;
    if (!dot) return;

    let cancelled = false;
    let rafId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const setDotPosition = (x: number, y: number) => {
      dot.setAttribute('cx', x.toFixed(3));
      dot.setAttribute('cy', y.toFixed(3));
    };

    // One full lap: release from rest, ride the centerline circle with a
    // small outward lift, decelerate, and land bit-identically back at rest.
    // Direction is neutral per the contract; clockwise is as good as any.
    const runLap = (onDone: () => void) => {
      const t0 = performance.now();
      const frame = (now: number) => {
        if (cancelled) return;
        const t = Math.min((now - t0) / duration, 1);
        const s = BRAND_EASE(t);
        const [x, y] = getLapPoint(build, s, false, RADIAL_LIFT_MAX);
        setDotPosition(x, y);
        if (t < 1) {
          rafId = requestAnimationFrame(frame);
        } else {
          // The endpoints are law: snap to the exact static rest position
          // rather than trust the trig at s=1, so the final frame is
          // bit-identical to the static mark.
          setDotPosition(rest[0], rest[1]);
          onDone();
        }
      };
      rafId = requestAnimationFrame(frame);
    };

    if (mode === 'once') {
      runLap(() => {});
    } else if (mode === 'waiting') {
      // Discrete laps, never a continuous spin: run a full lap, settle home,
      // pause, repeat for as long as this instance stays mounted in
      // 'waiting' mode. See docs/dev/motion-rules.md.
      const loop = () => {
        if (cancelled) return;
        runLap(() => {
          if (cancelled) return;
          timeoutId = setTimeout(loop, WAITING_REST_PAUSE_MS);
        });
      };
      loop();
    }

    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (timeoutId !== null) clearTimeout(timeoutId);
      // Land back at rest so unmount/mode-change mid-flight never leaves a
      // stray frame behind.
      setDotPosition(rest[0], rest[1]);
    };
  }, [shouldAnimate, mode, duration, build, rest]);

  const resolvedLabel = label === null ? undefined : label ?? (mode === 'waiting' ? 'Loading' : undefined);

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      role={resolvedLabel ? 'status' : undefined}
      aria-label={resolvedLabel}
      aria-hidden={resolvedLabel ? undefined : true}
    >
      <g transform="translate(6.5 0)">
        <g data-testid="signal-p-structure">
          <rect
            x={geo.stemX}
            y={SIGNAL_P_STEM.y}
            width={geo.stemW}
            height={SIGNAL_P_STEM.height}
            rx={SIGNAL_P_STEM.rx}
            fill={structureColor}
          />
          <path
            d={bowlPathD}
            fill="none"
            stroke={structureColor}
            strokeWidth={geo.sw}
            strokeLinecap="butt"
          />
        </g>
        <circle
          ref={dotRef}
          data-testid="signal-p-dot"
          cx={rest[0]}
          cy={rest[1]}
          r={geo.dotR}
          fill={dotColor}
        />
      </g>
    </svg>
  );
}
