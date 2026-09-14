import React, { useEffect, useState } from 'react';

const STEPS = [
  'Analyzing feature',
  'Building scenarios',
  'Generating test cases',
];

const LAST_STEP = STEPS.length - 1;

// Real generation now runs through a background job that's polled for
// completion, so it can legitimately take much longer than these
// illustrative step timings — once the last step is reached it stays there
// (still animating, never "frozen") for as long as it actually takes.
// After a while, a quiet reassurance line appears instead of looking stuck.
const SLOW_HINT_MS = 12_000;

interface Props {
  visible: boolean;
}

export function GeneratingProgress({ visible }: Props) {
  const [activeStep, setActiveStep] = useState(0);
  const [showSlowHint, setShowSlowHint] = useState(false);

  useEffect(() => {
    if (!visible) {
      setActiveStep(0);
      setShowSlowHint(false);
      return;
    }

    const timers = [
      setTimeout(() => setActiveStep(1), 900),
      setTimeout(() => setActiveStep(2), 2000),
      setTimeout(() => setShowSlowHint(true), SLOW_HINT_MS),
    ];

    return () => timers.forEach(clearTimeout);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="card p-5">
      <div className="space-y-3">
        {STEPS.slice(0, activeStep + 1).map((step, i) => {
          const done = i < activeStep;
          return (
            <div key={step} className="step-fade-in flex items-center gap-2.5 text-sm">
              <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                {done ? (
                  <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span className="relative flex w-2 h-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                  </span>
                )}
              </span>
              <span className={done ? 'text-gray-400' : 'text-shimmer font-medium'}>
                {step}
                {!done && i === LAST_STEP ? '…' : ''}
              </span>
            </div>
          );
        })}
      </div>
      {showSlowHint && (
        <p className="step-fade-in mt-3 pl-[26px] text-xs text-gray-400">
          Taking a little longer than usual — still working on it...
        </p>
      )}
    </div>
  );
}
