'use client';
// frontend/src/app/page.tsx — redirect to login or dashboard

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function Home() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      router.replace(isAuthenticated ? '/dashboard' : '/login');
    }
  }, [isAuthenticated, isLoading, router]);

  return (
    <div className="min-h-screen bg-gradient-animated flex items-center justify-center">
      <div className="spinner w-8 h-8" />
    </div>
  );
}
