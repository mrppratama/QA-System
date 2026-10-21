import React, { useEffect, useState } from 'react';

const STEPS = [
  'Menganalisis konteks halaman & elemen hasil scan',
  'Menyusun skenario pengujian (Happy Path, Validation, Edge Case)',
  'Menulis langkah pengujian & expected result secara detail',
];

const LAST_STEP = STEPS.length - 1;
const SLOW_HINT_MS = 12_000;

interface Props {
  visible: boolean;
  featureName?: string;
}

export function GeneratingProgress({ visible, featureName }: Props) {
  const [activeStep, setActiveStep] = useState(0);
  const [showSlowHint, setShowSlowHint] = useState(false);

  useEffect(() => {
    if (!visible) {
      setActiveStep(0);
      setShowSlowHint(false);
      return;
    }

    const timers = [
      setTimeout(() => setActiveStep(1), 1100),
      setTimeout(() => setActiveStep(2), 2500),
      setTimeout(() => setShowSlowHint(true), SLOW_HINT_MS),
    ];

    return () => timers.forEach(clearTimeout);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 w-full max-w-md p-6">
        {/* Header */}
        <div className="flex items-center gap-3.5 mb-5">
          <div className="w-11 h-11 rounded-xl bg-[#f0fbfa] border border-[#b0ece8] flex items-center justify-center text-[#089e9a] flex-shrink-0">
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3.5" />
              <path className="opacity-85" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-slate-900">AI Sedang Membuat Test Case...</h3>
              {featureName && (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#e6f9f8] text-[#06807d] border border-[#b0ece8] truncate max-w-[160px]">
                  {featureName}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Mohon tunggu sebentar, hasil akan tampil otomatis di bawah.
            </p>
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-3 bg-slate-50/80 border border-slate-100 rounded-xl p-4">
          {STEPS.slice(0, activeStep + 1).map((step, i) => {
            const done = i < activeStep;
            return (
              <div key={step} className="step-fade-in flex items-center gap-2.5 text-xs">
                <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                  {done ? (
                    <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="relative flex w-2.5 h-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3ec7be] opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#0ABAB5]" />
                    </span>
                  )}
                </span>
                <span className={done ? 'text-slate-400' : 'text-shimmer font-medium'}>
                  {step}
                  {!done && i === LAST_STEP ? '…' : ''}
                </span>
              </div>
            );
          })}
        </div>

        {showSlowHint && (
          <p className="step-fade-in mt-3 text-center text-xs text-slate-400">
            Proses AI membutuhkan waktu sedikit lebih lama — tetap sedang diproses...
          </p>
        )}
      </div>
    </div>
  );
}
