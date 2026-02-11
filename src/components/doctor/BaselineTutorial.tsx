import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';

interface BaselineTutorialProps {
  firstActionId: number;
  onComplete: () => void;
}

interface TutorialStep {
  targetSelector: string;
  title: string;
  description: string;
  position: 'bottom' | 'top' | 'right';
}

export function BaselineTutorial({ firstActionId, onComplete }: BaselineTutorialProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const steps: TutorialStep[] = [
    {
      targetSelector: `#score-btns-${firstActionId}`,
      title: 'Rate yourself',
      description: "You'll rate yourself on each Pro Move using these numbers. 1 = Needs focus, 4 = Exceptional.",
      position: 'bottom',
    },
    {
      targetSelector: `#pm-text-${firstActionId}`,
      title: 'Learn more',
      description: 'Tap any Pro Move to see more information about it.',
      position: 'bottom',
    },
    {
      targetSelector: `#note-btn-${firstActionId}`,
      title: 'Add notes',
      description: "If you have a question, comment, or thought about a Pro Move, jot it down here as you go.",
      position: 'right',
    },
  ];

  const updatePosition = useCallback(() => {
    const step = steps[currentStep];
    if (!step) return;
    const el = document.querySelector(step.targetSelector);
    if (el) {
      setTargetRect(el.getBoundingClientRect());
    }
  }, [currentStep, steps]);

  useEffect(() => {
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [updatePosition]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      onComplete();
    }
  };

  const step = steps[currentStep];
  if (!step || !targetRect) return null;

  // Calculate tooltip position
  const padding = 8;
  const tooltipStyle: React.CSSProperties = { position: 'fixed', zIndex: 60 };

  if (step.position === 'bottom') {
    tooltipStyle.top = targetRect.bottom + padding;
    tooltipStyle.left = Math.max(16, targetRect.left);
  } else if (step.position === 'top') {
    tooltipStyle.bottom = window.innerHeight - targetRect.top + padding;
    tooltipStyle.left = Math.max(16, targetRect.left);
  } else if (step.position === 'right') {
    tooltipStyle.top = targetRect.top;
    tooltipStyle.left = targetRect.right + padding;
  }

  // Cutout highlight
  const highlightStyle: React.CSSProperties = {
    position: 'fixed',
    top: targetRect.top - 4,
    left: targetRect.left - 4,
    width: targetRect.width + 8,
    height: targetRect.height + 8,
    borderRadius: 8,
    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
    zIndex: 55,
    pointerEvents: 'none',
  };

  return (
    <>
      {/* Backdrop cutout */}
      <div style={highlightStyle} />

      {/* Tooltip */}
      <div
        style={tooltipStyle}
        className="bg-popover border rounded-lg shadow-lg p-4 max-w-xs"
      >
        <p className="font-semibold text-sm mb-1">{step.title}</p>
        <p className="text-sm text-muted-foreground mb-3">{step.description}</p>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onComplete}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Skip
          </button>
          <Button size="sm" onClick={handleNext}>
            {currentStep < steps.length - 1 ? 'Next' : 'Got it'}
          </Button>
        </div>
        <div className="flex gap-1 mt-2 justify-center">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full ${i === currentStep ? 'bg-primary' : 'bg-muted-foreground/30'}`}
            />
          ))}
        </div>
      </div>
    </>
  );
}
