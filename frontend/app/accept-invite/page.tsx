'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900" />}>
      <AcceptInvitePageInner />
    </Suspense>
  );
}

function AcceptInvitePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');

    setLoading(true);
    try {
      await api.acceptInvite(token, password);
      setDone(true);
      setTimeout(() => router.push('/login'), 2000);
    } catch (err) {
      let msg = 'Failed to set password';
      if (err instanceof Error) {
        try { msg = JSON.parse(err.message).error || err.message; } catch { msg = err.message; }
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl mb-4 shadow-lg p-2">
            <img src="/logo-mark.png" alt="Nexantra Technologies" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-white">Nexantra Technologies</h1>
          <p className="text-slate-400 text-sm mt-1">Enterprise Fleet Management Platform</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          {!token ? (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2 rounded-lg">
              This invite link is missing its token. Ask your admin for a new invite.
            </div>
          ) : done ? (
            <div className="text-center space-y-2">
              <div className="text-green-600 text-sm font-medium">Password set. Redirecting to sign in…</div>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-slate-800 mb-1">Set your password</h2>
              <p className="text-sm text-slate-500 mb-6">Choose a password to activate your account.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">New Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Confirm Password</label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    required
                  />
                </div>
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2 rounded-lg">{error}</div>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2.5 rounded-lg transition-colors"
                >
                  {loading ? 'Setting password...' : 'Activate Account'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
