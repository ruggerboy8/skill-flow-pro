import React, { useState } from 'react';
import { Button } from '@/components/ui/button';

interface NumberScaleProps {
  value: number | null;
  onChange: (value: number) => void;
  disabled?: boolean;
  hideTips?: boolean;
}

export default function NumberScale({ value, onChange, disabled, hideTips }: NumberScaleProps) {
  const [persistentTooltip, setPersistentTooltip] = useState<number | null>(null);

  // Reset tooltip when value becomes null or undefined
  React.useEffect(() => {
    if (value === null || value === undefined) {
      setPersistentTooltip(null);
    }
  }, [value]);

  const tooltipText = {
    4: "I am a master and do it all the time.",
    3: "I do this 95% of the time.",
    2: "I have some room for improvement here.",
    1: "I rarely do this or didn't know I should have been doing it."
  };

  const handleClick = (score: number) => {
    onChange(score);
    setPersistentTooltip(score);
  };

  const getScoreStyle = (num: number, isSelected: boolean): React.CSSProperties => {
    if (!isSelected) return {};
    return {
      backgroundColor: `hsl(var(--score-${num}-bg))`,
      borderColor: `hsl(var(--score-${num}) / 0.5)`,
      color: `hsl(var(--score-${num}))`,
    };
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-2">
        {[1, 2, 3, 4].map((score) => (
          <Button
            key={score}
            variant="outline"
            onClick={() => handleClick(score)}
            disabled={disabled}
            aria-label={`${score === 4 ? 'Confidence' : 'Performance'} ${score} – ${tooltipText[score as keyof typeof tooltipText]}`}
            className={`h-12 w-full text-lg font-semibold transition-all ${
              value !== score ? 'hover:bg-slate-50 border-slate-200 text-slate-600' : ''
            }`}
            style={getScoreStyle(score, value === score)}
          >
            {score}
          </Button>
        ))}
      </div>

      {persistentTooltip && !hideTips && (
        <div className="text-sm text-muted-foreground p-3 bg-muted rounded-lg">
          <strong>{persistentTooltip}</strong> – {tooltipText[persistentTooltip as keyof typeof tooltipText]}
        </div>
      )}
    </div>
  );
}
