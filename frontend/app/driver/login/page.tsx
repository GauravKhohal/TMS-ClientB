'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { driverApi } from '@/lib/driverApi';
import { saveDriverAuth } from '@/lib/driverAuth';

const INPUT = 'w-full px-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm';

export default function DriverLoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [demoOtp, setDemoOtp] = useState('');
  const [driverName, setDriverName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await driverApi.requestOtp(phone);
      setDriverName(res.driverName);
      setDemoOtp(res.otp || '');
      setStep('otp');
    } catch {
      setError('No driver account found for this phone number.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await driverApi.verifyOtp(phone, otp);
      saveDriverAuth(res.token, res.driver);
      router.push('/driver/trips');
    } catch {
      setError('Incorrect or expired OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl mb-4 shadow-lg p-2">
            <img src="/logo-mark.png" alt="Nexantra Technologies" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-white">Driver Login</h1>
          <p className="text-slate-400 text-sm mt-1">Nexantra Technologies Fleet Management</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          {step === 'phone' ? (
            <form onSubmit={handleRequestOtp} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder="98765xxxxx" className={INPUT} required />
              </div>
              {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2 rounded-lg">{error}</div>}
              <button type="submit" disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2.5 rounded-lg transition-colors">
                {loading ? 'Sending...' : 'Send OTP'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <p className="text-sm text-slate-600">Hi {driverName}, enter the OTP sent to {phone}.</p>
              {demoOtp && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-3 py-2 rounded-lg">
                  <strong>WhatsApp not configured — demo mode.</strong> Your OTP: <span className="font-mono font-bold">{demoOtp}</span>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">OTP</label>
                <input type="text" inputMode="numeric" value={otp} onChange={e => setOtp(e.target.value)}
                  placeholder="6-digit code" className={INPUT} required />
              </div>
              {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2 rounded-lg">{error}</div>}
              <button type="submit" disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2.5 rounded-lg transition-colors">
                {loading ? 'Verifying...' : 'Verify & Continue'}
              </button>
              <button type="button" onClick={() => { setStep('phone'); setOtp(''); setError(''); }}
                className="w-full text-xs text-slate-500 hover:text-slate-700">
                Change phone number
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
