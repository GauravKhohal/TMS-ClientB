'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getDriver, driverLogout } from '@/lib/driverAuth';

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const isLoginPage = pathname === '/driver/login';

  useEffect(() => {
    if (isLoginPage) { setReady(true); return; }
    if (!localStorage.getItem('driver_token')) {
      router.push('/driver/login');
      return;
    }
    setReady(true);
  }, [router, isLoginPage]);

  if (!ready) return null;
  if (isLoginPage) return <>{children}</>;

  const driver = getDriver();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div>
          <div className="text-sm font-bold text-slate-800">Nexantra Technologies</div>
          <div className="text-xs text-slate-400">{driver?.name}</div>
        </div>
        <button onClick={driverLogout} className="text-xs font-medium text-slate-500 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50">
          Sign Out
        </button>
      </header>
      <main className="p-4 max-w-lg mx-auto">{children}</main>
    </div>
  );
}
