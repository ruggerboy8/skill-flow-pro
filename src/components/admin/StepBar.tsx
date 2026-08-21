import { Check } from 'lucide-react';

interface StepBarProps {
  currentStep: number;
  steps: string[];
}

// DSN-3 slice 3: completed → --status-complete (solid fill, safe for white
// text), current → primary (brand chrome — "this is the active step" is
// exactly the primary-action semantic), upcoming → muted (generic chrome).
export function StepBar({ currentStep, steps }: StepBarProps) {
  return (
    <div className="flex items-center justify-center space-x-4 mb-6">
      {steps.map((step, index) => (
        <div key={step} className="flex items-center">
          <div
            className={`
            flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium
            ${index < currentStep
              ? 'text-white'
              : index === currentStep
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            }
          `}
            style={index < currentStep ? { backgroundColor: 'hsl(var(--status-complete))' } : undefined}
          >
            {index < currentStep ? (
              <Check className="w-4 h-4" />
            ) : (
              index + 1
            )}
          </div>
          <span className={`ml-2 text-sm font-medium ${
            index <= currentStep ? 'text-foreground' : 'text-muted-foreground'
          }`}>
            {step}
          </span>
          {index < steps.length - 1 && (
            <div
              className={`ml-4 w-8 h-0.5 ${index < currentStep ? '' : 'bg-muted'}`}
              style={index < currentStep ? { backgroundColor: 'hsl(var(--status-complete))' } : undefined}
            />
          )}
        </div>
      ))}
    </div>
  );
}
