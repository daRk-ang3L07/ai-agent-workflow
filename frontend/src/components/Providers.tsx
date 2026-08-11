'use client';
// frontend/src/components/Providers.tsx

import { ApolloProvider } from '@apollo/client';
import { apolloClient } from '@/lib/apollo';
import { AuthProvider } from '@/lib/auth-context';
import { Toaster } from 'react-hot-toast';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ApolloProvider client={apolloClient}>
      <AuthProvider>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#1a1a2e',
              color: '#e2e8f0',
              border: '1px solid rgba(99, 102, 241, 0.2)',
              borderRadius: '12px',
              fontSize: '14px',
            },
            success: {
              iconTheme: { primary: '#10b981', secondary: '#fff' },
            },
            error: {
              iconTheme: { primary: '#f43f5e', secondary: '#fff' },
            },
          }}
        />
      </AuthProvider>
    </ApolloProvider>
  );
}
