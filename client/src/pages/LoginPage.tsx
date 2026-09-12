import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export function LoginPage() {
  const { signIn, configured } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    <div className="h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center mb-3">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <h1 className="text-base font-bold text-gray-900">QA Generator</h1>
          <p className="text-xs text-gray-400">Masuk untuk melanjutkan</p>
        </div>

        <div className="card p-5">
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
                  autoFocus
                  required
                />
              </div>
              <div>
                <label className="label-xs">Password</label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
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
  );
}
