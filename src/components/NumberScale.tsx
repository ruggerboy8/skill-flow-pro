import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface NumberScaleProps {
  value: number | null;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export default function NumberScale({ value, onChange, disabled }: NumberScaleProps) {
  const [showTooltip, setShowTooltip] = useState<number | null>(null);

  const tooltipText = {
    4: "Absolute PRO: you never miss, could teach a seminar.",
    3: "Pretty darn good: ~95% of the time at high quality.",
    2: "Getting better: reasonably consistent but room to improve.",
    1: "Needs more support: skill is still developing."
  };

  const handleClick = (score: number) => {
    onChange(score);
    setShowTooltip(score);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-2">
        {[1, 2, 3, 4].map((score) => (
          <Button
            key={score}
            variant={value === score ? "default" : "outline"}
            onClick={() => handleClick(score)}
            disabled={disabled}
            className={`h-12 text-lg font-semibold ${
              value === score 
                ? 'bg-primary text-primary-foreground' 
                : 'hover:bg-accent hover:text-accent-foreground'
            }`}
          >
            {score}
          </Button>
        ))}
      </div>

      {showTooltip && (
        <div className="text-sm text-muted-foreground p-3 bg-muted rounded-lg transition-opacity duration-150">
          <strong>{showTooltip}</strong> – {tooltipText[showTooltip as keyof typeof tooltipText]}
        </div>
      )}
    </div>
  );
}