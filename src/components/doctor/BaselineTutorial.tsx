import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';

interface BaselineTutorialProps {
  firstActionId: number;
  onComplete: () => void;
  onForceOpenMaterials: (actionId: number) => void;
  onCloseMaterials: () => void;
}

interface TutorialStep {
  targetSelector: string;
  title: string;
  description: string;
  position: 'bottom' | 'top' | 'right' | 'left-center';
  waitForUserClick?: boolean;
  closeDrawerOnAdvance?: boolean;
}

export function BaselineTutorial({ firstActionId, onComplete, onForceOpenMaterials, onCloseMaterials }: BaselineTutorialProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const drawerOpen = useRef(false);

  const steps: TutorialStep[] = [
    {
      targetSelector: `#score-btns-${firstActionId}`,
      title: 'Rate yourself',
      description: "You'll rate yourself on each Pro Move using these numbers. 1 = I rarely do this, 4 = I am a master.",
      position: 'bottom',
    },
    {
      targetSelector: `#pm-text-${firstActionId}`,
      title: 'Tap to learn more',
      description: 'Tap this Pro Move now to see the learning materials.',
      position: 'bottom',
      waitForUserClick: true,
    },
    {
      targetSelector: '[data-tutorial-drawer]',
      title: 'Learning materials',
      description: "This is where you'll find everything you need — why this Pro Move matters, scripts you can use, and what great looks like. You can open this for any Pro Move anytime.",
      position: 'left-center',
      closeDrawerOnAdvance: true,
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
    // Don't set null — keep last known rect to avoid flicker during transitions
  }, [currentStep]);

  // Keep polling continuously (no 5s cutoff) so tutorial never strands
  useEffect(() => {
    updatePosition();
    const interval = setInterval(updatePosition, 150);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [updatePosition]);

  // For the "waitForUserClick" step: listen for the pro move click directly
  useEffect(() => {
    const step = steps[currentStep];
    if (!step?.waitForUserClick) return;

    const el = document.querySelector(step.targetSelector) as HTMLElement | null;
    if (!el) return;

    const handler = () => {
      drawerOpen.current = true;
      const poll = setInterval(() => {
        const drawerEl = document.querySelector('[data-tutorial-drawer]');
        if (drawerEl) {
          clearInterval(poll);
          setCurrentStep(prev => prev + 1);
        }
      }, 50);
      setTimeout(() => clearInterval(poll), 3000);
    };

    el.addEventListener('click', handler);
    return () => el.removeEventListener('click', handler);
  }, [currentStep]);

  const advanceStep = () => {
    const step = steps[currentStep];
    if (step?.closeDrawerOnAdvance) {
      onCloseMaterials();
      drawerOpen.current = false;
      const nextIndex = currentStep + 1;
      const nextSelector = steps[nextIndex]?.targetSelector;
      // Poll for next target to exist before advancing (drawer close animation)
      if (nextSelector) {
        const poll = setInterval(() => {
          const el = document.querySelector(nextSelector);
          if (el) {
            clearInterval(poll);
            setCurrentStep(nextIndex);
          }
        }, 50);
        setTimeout(() => clearInterval(poll), 2000);
      }
      return;
    }
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      onComplete();
    }
  };

  const handleNext = () => {
    const step = steps[currentStep];
    if (step?.waitForUserClick) return;
    advanceStep();
  };

  const handleSkip = () => {
    if (drawerOpen.current) {
      onCloseMaterials();
      drawerOpen.current = false;
    }
    onComplete();
  };

  const step = steps[currentStep];
  if (!step || !targetRect) return null;

  const padding = 12;
  const tooltipStyle: React.CSSProperties = { position: 'fixed', zIndex: 10050 };

  if (step.position === 'bottom') {
    tooltipStyle.top = targetRect.bottom + padding;
    tooltipStyle.left = Math.max(16, targetRect.left);
  } else if (step.position === 'top') {
    tooltipStyle.bottom = window.innerHeight - targetRect.top + padding;
    tooltipStyle.left = Math.max(16, targetRect.left);
  } else if (step.position === 'right') {
    tooltipStyle.top = targetRect.top;
    tooltipStyle.left = targetRect.right + padding;
  } else if (step.position === 'left-center') {
    tooltipStyle.top = targetRect.top + targetRect.height / 2 - 80;
    tooltipStyle.right = window.innerWidth - targetRect.left + padding;
  }

  const highlightStyle: React.CSSProperties = {
    position: 'fixed',
    top: targetRect.top - 4,
    left: targetRect.left - 4,
    width: targetRect.width + 8,
    height: targetRect.height + 8,
    borderRadius: 8,
    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
    zIndex: 10049,
    pointerEvents: 'none',
  };

  return createPortal(
    <>
      <div style={highlightStyle} />

      {/* Tooltip */}
      <div
        data-tutorial-tooltip
        style={tooltipStyle}
        className="bg-popover border rounded-lg shadow-lg p-4 max-w-xs"
      >
        <p className="font-semibold text-sm mb-1">{step.title}</p>
        <p className="text-sm text-muted-foreground mb-3">{step.description}</p>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={handleSkip}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Skip
          </button>
          {step.waitForUserClick ? (
            <span className="text-xs text-muted-foreground italic">Tap the Pro Move above ↑</span>
          ) : (
            <Button size="sm" onClick={handleNext}>
              {currentStep < steps.length - 1 ? 'Next' : 'Got it'}
            </Button>
          )}
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
    </>,
    document.body
  );
}
