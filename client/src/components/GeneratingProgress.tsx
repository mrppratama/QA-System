import React, { useEffect, useState } from 'react';

const steps = [
  'Analyzing feature',
  'Building scenarios',
  'Generating test cases',
];

interface Props {
  visible: boolean;
}

export function GeneratingProgress({ visible }: Props) {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    if (!visible) {
      setActiveStep(0);
      return;
    }

    const timers = [
      setTimeout(() => setActiveStep(1), 1200),
      setTimeout(() => setActiveStep(2), 2500),
    ];

    return () => timers.forEach(clearTimeout);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <svg className="w-4 h-4 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Generating test cases...
      </div>
      <div className="space-y-2">
        {steps.map((step, i) => (
          <div key={step} className="flex items-center gap-2 text-sm">
            {i < activeStep ? (
              <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : i === activeStep ? (
              <svg className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
              </span>
            )}
            <span className={i <= activeStep ? 'text-gray-800' : 'text-gray-400'}>
              {step}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
