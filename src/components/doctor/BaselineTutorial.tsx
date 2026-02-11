import { useState, useEffect, useCallback } from 'react';
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
  requiresAction?: 'click-pro-move';
  /** If true, closing this step will also close the materials drawer */
  closeDrawerOnAdvance?: boolean;
}

export function BaselineTutorial({ firstActionId, onComplete, onForceOpenMaterials, onCloseMaterials }: BaselineTutorialProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [waitingForAction, setWaitingForAction] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

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
      description: 'Go ahead — tap this Pro Move now to see the learning materials.',
      position: 'bottom',
      requiresAction: 'click-pro-move',
    },
    {
      // Target the sheet content panel
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
    // Poll briefly for drawer elements that may not exist yet
    const interval = setInterval(updatePosition, 200);
    const timeout = setTimeout(() => clearInterval(interval), 3000);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [updatePosition]);

  // Listen for materials sheet opening to advance to the drawer explanation step
  useEffect(() => {
    if (!waitingForAction) return;
    
    const handleSheetOpened = () => {
      setWaitingForAction(false);
      setDrawerOpen(true);
      // Wait for drawer animation to finish, then advance
      setTimeout(() => {
        setCurrentStep(prev => prev + 1);
      }, 600);
    };

    window.addEventListener('tutorial-materials-opened', handleSheetOpened);
    return () => window.removeEventListener('tutorial-materials-opened', handleSheetOpened);
  }, [waitingForAction]);

  const advanceStep = () => {
    const step = steps[currentStep];
    
    // Close drawer if this step requires it
    if (step?.closeDrawerOnAdvance) {
      onCloseMaterials();
      setDrawerOpen(false);
    }

    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      onComplete();
    }
  };

  const handleNext = () => {
    const step = steps[currentStep];
    if (step?.requiresAction === 'click-pro-move') {
      setWaitingForAction(true);
      onForceOpenMaterials(firstActionId);
      return;
    }
    advanceStep();
  };

  const handleSkip = () => {
    if (drawerOpen) {
      onCloseMaterials();
      setDrawerOpen(false);
    }
    onComplete();
  };

  const step = steps[currentStep];
  if (!step || !targetRect) return null;

  // Calculate tooltip position
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
    // Position to the left of the drawer
    tooltipStyle.top = targetRect.top + targetRect.height / 2 - 80;
    tooltipStyle.right = window.innerWidth - targetRect.left + padding;
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
    zIndex: 9998,
    pointerEvents: 'none',
  };

  return (
    <>
      {/* Backdrop cutout */}
      <div style={highlightStyle} />

      {/* Allow clicking through to the target element for action steps */}
      {step.requiresAction && (
        <div
          style={{
            position: 'fixed',
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
            zIndex: 9999,
            cursor: 'pointer',
          }}
          onClick={() => handleNext()}
        />
      )}

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
          {!step.requiresAction && (
            <Button size="sm" onClick={handleNext}>
              {currentStep < steps.length - 1 ? 'Next' : 'Got it'}
            </Button>
          )}
          {step.requiresAction && !waitingForAction && (
            <Button size="sm" onClick={handleNext}>
              Tap it ↑
            </Button>
          )}
          {waitingForAction && (
            <span className="text-xs text-muted-foreground">Opening...</span>
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
    </>
  );
}
