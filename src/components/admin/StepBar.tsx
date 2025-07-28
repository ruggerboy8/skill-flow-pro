import { Check } from 'lucide-react';

interface StepBarProps {
  currentStep: number;
  steps: string[];
}

export function StepBar({ currentStep, steps }: StepBarProps) {
  return (
    <div className="flex items-center justify-center space-x-4 mb-6">
      {steps.map((step, index) => (
        <div key={step} className="flex items-center">
          <div className={`
            flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium
            ${index < currentStep 
              ? 'bg-green-500 text-white' 
              : index === currentStep 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-300 text-gray-600'
            }
          `}>
            {index < currentStep ? (
              <Check className="w-4 h-4" />
            ) : (
              index + 1
            )}
          </div>
          <span className={`ml-2 text-sm font-medium ${
            index <= currentStep ? 'text-gray-900' : 'text-gray-400'
          }`}>
            {step}
          </span>
          {index < steps.length - 1 && (
            <div className={`ml-4 w-8 h-0.5 ${
              index < currentStep ? 'bg-green-500' : 'bg-gray-300'
            }`} />
          )}
        </div>
      ))}
    </div>
  );
}