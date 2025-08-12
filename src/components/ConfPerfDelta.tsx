import { ArrowDown, ArrowDownRight, ArrowRight, ArrowUp, ArrowUpRight } from "lucide-react";

interface ConfPerfDeltaProps {
  confidence: number | null | undefined;
  performance: number | null | undefined;
}

export default function ConfPerfDelta({ confidence, performance }: ConfPerfDeltaProps) {
  const hasConf = confidence !== null && confidence !== undefined;
  const hasPerf = performance !== null && performance !== undefined;

  let delta: number | null = null;
  if (hasConf && hasPerf) {
    delta = (performance as number) - (confidence as number);
  }

  const getArrow = () => {
    if (delta === null) return null;
    const aria =
      delta >= 2
        ? "Performance up two"
        : delta === 1
        ? "Performance up one"
        : delta === 0
        ? "No change"
        : delta === -1
        ? "Performance down one"
        : "Performance down two";

    const positive = delta >= 1;
    const negative = delta <= -1;

    const colorClass = positive
      ? "text-[hsl(var(--positive))]"
      : negative
      ? "text-[hsl(var(--destructive))]"
      : "text-muted-foreground";

    const size = 18;

    if (delta >= 2) return <ArrowUp aria-label={aria} className={colorClass} size={size} />;
    if (delta === 1) return <ArrowUpRight aria-label={aria} className={colorClass} size={size} />;
    if (delta === 0) return <ArrowRight aria-label={aria} className={colorClass} size={size} />;
    if (delta === -1) return <ArrowDownRight aria-label={aria} className={colorClass} size={size} />;
    return <ArrowDown aria-label={aria} className={colorClass} size={size} />;
  };

  return (
    <div className="flex items-end gap-3 sm:gap-4">
      <div className="flex flex-col items-center leading-none">
        <span className="uppercase text-[10px] tracking-wide text-muted-foreground">CONF</span>
        <span className="font-semibold text-sm sm:text-base">{hasConf ? confidence : "—"}</span>
      </div>
      <div className="flex items-center justify-center min-w-[18px] pb-[2px]">{getArrow()}</div>
      <div className="flex flex-col items-center leading-none">
        <span className="uppercase text-[10px] tracking-wide text-muted-foreground">PERF</span>
        <span className="font-semibold text-sm sm:text-base">{hasPerf ? performance : "—"}</span>
      </div>
    </div>
  );
}
