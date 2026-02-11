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

  const getSemanticColor = (num: number, isSelected: boolean) => {
    if (!isSelected) return "hover:bg-slate-50 border-slate-200 text-slate-600";
    
    switch(num) {
      case 1: return "bg-orange-100 border-orange-300 text-orange-800 hover:bg-orange-200";
      case 2: return "bg-amber-100 border-amber-300 text-amber-800 hover:bg-amber-200";
      case 3: return "bg-blue-100 border-blue-300 text-blue-800 hover:bg-blue-200";
      case 4: return "bg-emerald-100 border-emerald-300 text-emerald-800 hover:bg-emerald-200";
      default: return "bg-primary text-primary-foreground";
    }
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
            className={`h-12 w-full text-lg font-semibold transition-all ${getSemanticColor(score, value === score)}`}
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