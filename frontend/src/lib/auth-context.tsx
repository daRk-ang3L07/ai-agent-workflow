'use client';
// frontend/src/lib/auth-context.tsx
// Auth + Organization context provider using nhost v3 SDK

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { nhost } from './nhost';
import { apolloClient } from './apollo';
import { GET_MY_ORGS } from './graphql/queries';

interface OrgMember {
  id: string;
  role: 'owner' | 'editor' | 'viewer';
  organization: {
    id: string;
    name: string;
    slug: string;
    quota_calls_allowed: number;
    quota_calls_used: number;
    quota_calls_pending: number;
  };
}

interface AuthContextType {
  user: any;
  isAuthenticated: boolean;
  isLoading: boolean;
  orgs: OrgMember[];
  currentOrg: OrgMember | null;
  currentRole: 'owner' | 'editor' | 'viewer' | null;
  setCurrentOrgId: (id: string) => void;
  signOut: () => Promise<void>;
  refetchOrgs: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  orgs: [],
  currentOrg: null,
  currentRole: null,
  setCurrentOrgId: () => {},
  signOut: async () => {},
  refetchOrgs: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [orgs, setOrgs] = useState<OrgMember[]>([]);
  const [currentOrgId, setCurrentOrgIdState] = useState<string | null>(null);

  const fetchOrgs = useCallback(async (authenticated: boolean) => {
    if (!authenticated) {
      setOrgs([]);
      return;
    }
    try {
      const { data } = await apolloClient.query({
        query: GET_MY_ORGS,
        fetchPolicy: 'network-only',
      });
      setOrgs(data?.org_members || []);
    } catch (err) {
      // May fail if permissions not yet configured
      console.warn('Failed to fetch orgs:', err);
      setOrgs([]);
    }
  }, []);

  useEffect(() => {
    // Subscribe to auth state changes (nhost v3)
    const unsubscribe = nhost.auth.onAuthStateChanged((_event, session) => {
      if (session?.user) {
        setUser(session.user);
        setIsAuthenticated(true);
        fetchOrgs(true).finally(() => setIsLoading(false));
      } else {
        setUser(null);
        setIsAuthenticated(false);
        setCurrentOrgIdState(null);
        setOrgs([]);
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, [fetchOrgs]);

  // Auto-select first org if none selected
  useEffect(() => {
    if (orgs.length > 0 && !currentOrgId) {
      setCurrentOrgIdState(orgs[0].organization.id);
    }
  }, [orgs, currentOrgId]);

  const setCurrentOrgId = (id: string) => setCurrentOrgIdState(id);
  const currentOrg = orgs.find(m => m.organization.id === currentOrgId) || orgs[0] || null;
  const currentRole = currentOrg?.role || null;

  useEffect(() => {
    if (typeof window !== 'undefined' && currentRole) {
      window.localStorage.setItem('currentRole', currentRole);
      // Optional: apolloClient.resetStore() if data leaks between orgs
    }
  }, [currentRole]);

  const signOut = async () => {
    await nhost.auth.signOut();
  };

  const refetchOrgs = async () => {
    await fetchOrgs(isAuthenticated);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoading,
        orgs,
        currentOrg,
        currentRole,
        setCurrentOrgId,
        signOut,
        refetchOrgs,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
