import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const FEATURES = [
  'Generate test case otomatis dengan AI',
  'Dashboard & analitik testing real-time',
  'Export automation script (Cypress/Playwright/Selenium)',
];

function BrandMark({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

export function LoginPage() {
  const { signIn, configured } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    setError('');
    const { error: signInError } = await signIn(email.trim(), password);
    if (signInError) setError(signInError);
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex">
      {/* ── Left branding panel (desktop only) ── */}
      <div className="hidden md:flex md:w-[44%] lg:w-2/5 relative flex-col justify-between overflow-hidden bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white p-10 lg:p-12">
        <div
          className="absolute inset-0 opacity-[0.12]"
          style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '22px 22px' }}
        />
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-16 w-80 h-80 bg-indigo-400/20 rounded-full blur-3xl" />

        <div className="relative z-10">
          <div className="w-11 h-11 bg-white/15 backdrop-blur rounded-xl flex items-center justify-center mb-8 ring-1 ring-white/20">
            <BrandMark className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-2xl font-bold leading-snug max-w-xs">
            Kelola test case, automation script, dan dashboard QA dalam satu tempat.
          </h1>
        </div>

        <ul className="relative z-10 space-y-3 text-sm text-blue-50/90">
          {FEATURES.map(item => (
            <li key={item} className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-white/15 flex items-center justify-center flex-shrink-0">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </span>
              {item}
            </li>
          ))}
        </ul>

        <p className="relative z-10 text-xs text-blue-100/60">QA Generator © {new Date().getFullYear()}</p>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex items-center justify-center p-4 bg-gray-50">
        <div className="w-full max-w-sm">
          {/* Compact brand header (mobile only) */}
          <div className="flex flex-col items-center mb-6 md:hidden">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center mb-3">
              <BrandMark className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-base font-bold text-gray-900">QA Generator</h1>
            <p className="text-xs text-gray-400">Masuk untuk melanjutkan</p>
          </div>

          {/* Heading (desktop only, mirrors the branding side) */}
          <div className="hidden md:block mb-6">
            <h2 className="text-xl font-bold text-gray-900">Masuk</h2>
            <p className="text-sm text-gray-400 mt-1">Masuk untuk melanjutkan ke akun kamu</p>
          </div>

          <div className="card p-5 shadow-md shadow-gray-200/50">
            {!configured ? (
              <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded">
                Supabase belum dikonfigurasi. Set <code>VITE_SUPABASE_URL</code> dan{' '}
                <code>VITE_SUPABASE_ANON_KEY</code> di environment variables client.
              </p>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label-xs">Email</label>
                  <input
                    type="email"
                    className="input-field"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    autoComplete="email"
                    autoFocus
                    required
                  />
                </div>
                <div>
                  <label className="label-xs">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="input-field pr-10"
                      placeholder="••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      tabIndex={-1}
                      className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-gray-600"
                      aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                    >
                      <EyeIcon open={showPassword} />
                    </button>
                  </div>
                </div>
                {error && (
                  <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>
                )}
                <button
                  type="submit"
                  disabled={loading || !email.trim() || !password}
                  className="btn-primary w-full"
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                </button>
              </form>
            )}
          </div>

          <p className="text-center text-xs text-gray-400 mt-4">
            Belum punya akun? Hubungi admin untuk dibuatkan akses.
          </p>
        </div>
      </div>
    </div>
  );
}
