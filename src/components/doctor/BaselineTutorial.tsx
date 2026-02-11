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
  /** Auto-advance when the drawer closes (user closes it naturally) */
  waitForDrawerClose?: boolean;
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
      description: "This is where you'll find everything you need — why this Pro Move matters, scripts you can use, and what great looks like. You can open this for any Pro Move anytime.\n\nClose the drawer to continue.",
      position: 'left-center',
      waitForDrawerClose: true,
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
    // Don't null out — keep last rect to avoid flicker
  }, [currentStep]);

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

  // For "waitForUserClick": listen for the pro move click
  useEffect(() => {
    const step = steps[currentStep];
    if (!step?.waitForUserClick) return;

    const el = document.querySelector(step.targetSelector) as HTMLElement | null;
    if (!el) return;

    const handler = () => {
      drawerOpen.current = true;
      const poll = setInterval(() => {
        if (document.querySelector('[data-tutorial-drawer]')) {
          clearInterval(poll);
          setCurrentStep(prev => prev + 1);
        }
      }, 50);
      setTimeout(() => clearInterval(poll), 3000);
    };

    el.addEventListener('click', handler);
    return () => el.removeEventListener('click', handler);
  }, [currentStep]);

  // For "waitForDrawerClose": auto-advance when drawer disappears from DOM
  useEffect(() => {
    const step = steps[currentStep];
    if (!step?.waitForDrawerClose) return;

    const poll = setInterval(() => {
      const drawerEl = document.querySelector('[data-tutorial-drawer]');
      if (!drawerEl) {
        // Drawer has closed — advance to next step
        clearInterval(poll);
        drawerOpen.current = false;
        const nextIndex = currentStep + 1;
        const nextSelector = steps[nextIndex]?.targetSelector;
        // Poll for next target to appear
        if (nextSelector) {
          const poll2 = setInterval(() => {
            if (document.querySelector(nextSelector)) {
              clearInterval(poll2);
              setCurrentStep(nextIndex);
            }
          }, 50);
          setTimeout(() => clearInterval(poll2), 2000);
        }
      }
    }, 100);

    return () => clearInterval(poll);
  }, [currentStep]);

  const handleNext = () => {
    const step = steps[currentStep];
    if (step?.waitForUserClick || step?.waitForDrawerClose) return;
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      onComplete();
    }
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

  // Determine button display
  const showHint = step.waitForUserClick || step.waitForDrawerClose;
  const hintText = step.waitForUserClick
    ? 'Tap the Pro Move above ↑'
    : 'Close the drawer to continue →';

  return createPortal(
    <>
      <div style={highlightStyle} />

      <div
        data-tutorial-tooltip
        style={tooltipStyle}
        className="bg-popover border rounded-lg shadow-lg p-4 max-w-xs"
      >
        <p className="font-semibold text-sm mb-1">{step.title}</p>
        <p className="text-sm text-muted-foreground mb-3 whitespace-pre-line">{step.description}</p>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={handleSkip}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Skip
          </button>
          {showHint ? (
            <span className="text-xs text-muted-foreground italic">{hintText}</span>
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
