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
  /** User must click the highlighted element to advance */
  waitForUserClick?: boolean;
  /** Close the materials drawer when advancing past this step */
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
    } else {
      setTargetRect(null);
    }
  }, [currentStep]);

  useEffect(() => {
    updatePosition();
    const interval = setInterval(updatePosition, 150);
    const timeout = setTimeout(() => clearInterval(interval), 5000);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
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
      // User clicked the pro move — it will open the drawer via normal flow.
      // We need to wait for the drawer to appear, then advance.
      drawerOpen.current = true;
      const poll = setInterval(() => {
        const drawerEl = document.querySelector('[data-tutorial-drawer]');
        if (drawerEl) {
          clearInterval(poll);
          setCurrentStep(prev => prev + 1);
        }
      }, 50);
      // Safety timeout
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
      // Advance immediately — the note element is already in the DOM
      setCurrentStep(prev => prev + 1);
      return;
    }
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      onComplete();
    }
  };

  const handleNext = () => {
    // Don't allow button-based advancement for waitForUserClick steps
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
  const tooltipStyle: React.CSSProperties = { position: 'fixed', zIndex: 9999 };

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
    zIndex: 9998,
    pointerEvents: 'none',
  };

  // Block clicks on Sheet overlay during drawer step
  const needsClickBlocker = step.closeDrawerOnAdvance;

  return createPortal(
    <>
      {/* Full-screen click blocker above Sheet overlay (z-50) but below tutorial UI (z-9998) */}
      {needsClickBlocker && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9997 }}
          onClick={(e) => e.stopPropagation()}
        />
      )}
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
