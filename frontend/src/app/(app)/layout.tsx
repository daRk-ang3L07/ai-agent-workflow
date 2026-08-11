'use client';
// frontend/src/app/(app)/layout.tsx
// Authenticated app shell with sidebar

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Sidebar } from '@/components/Sidebar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-animated flex items-center justify-center">
        <div className="spinner w-8 h-8" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-gradient-animated flex flex-col md:flex-row">
      <div className="orb orb-violet" style={{ opacity: 0.07 }} />
      <div className="orb orb-cyan" style={{ opacity: 0.05 }} />
      <Sidebar />
      <main className="flex-1 md:ml-64 min-h-screen relative z-10 w-full overflow-x-hidden">
        <div className="p-4 md:p-8">{children}</div>
      </main>
    </div>
  );
}
