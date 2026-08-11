'use client';
// frontend/src/components/Sidebar.tsx

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  LayoutDashboard, Workflow, Play, Settings,
  LogOut, ChevronDown, Zap, Shield
} from 'lucide-react';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/workflows', label: 'Workflows', icon: Workflow },
  { href: '/settings', label: 'Settings', icon: Settings },
];

const ROLE_COLORS = {
  owner: 'text-amber-400',
  editor: 'text-blue-400',
  viewer: 'text-gray-400',
};

export function Sidebar() {
  const pathname = usePathname();
  const { user, currentOrg, currentRole, orgs, setCurrentOrgId, signOut } = useAuth();
  const [orgDropdown, setOrgDropdown] = React.useState(false);

  return (
    <aside className="sidebar w-full md:w-64 flex flex-col h-auto md:h-full relative md:fixed left-0 top-0 z-30">
      {/* Logo */}
      <div className="p-5 border-b border-indigo-900/20">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
            <Zap size={16} className="text-white" />
          </div>
          <span className="font-bold text-lg gradient-text">FlowAgent</span>
        </div>
        <p className="text-xs text-gray-500 mt-1 ml-10">AI Workflow Builder</p>
      </div>

      {/* Org selector */}
      <div className="p-3 border-b border-indigo-900/20">
        <button
          onClick={() => setOrgDropdown(!orgDropdown)}
          className="w-full flex items-center justify-between p-3 rounded-xl bg-indigo-950/40 hover:bg-indigo-950/60 transition-colors"
        >
          <div className="flex items-start flex-col min-w-0">
            <span className="text-sm font-semibold text-gray-200 truncate">
              {currentOrg?.organization.name || 'No org'}
            </span>
            <div className="flex items-center gap-1 mt-0.5">
              <Shield size={10} className={ROLE_COLORS[currentRole || 'viewer']} />
              <span className={`text-xs font-medium ${ROLE_COLORS[currentRole || 'viewer']}`}>
                {currentRole || '—'}
              </span>
            </div>
          </div>
          <ChevronDown
            size={16}
            className={`text-gray-400 transition-transform flex-shrink-0 ml-2 ${orgDropdown ? 'rotate-180' : ''}`}
          />
        </button>

        {orgDropdown && orgs.length > 1 && (
          <div className="mt-1 rounded-xl bg-gray-900 border border-indigo-900/30 overflow-hidden">
            {orgs.map(m => (
              <button
                key={m.organization.id}
                onClick={() => {
                  setCurrentOrgId(m.organization.id);
                  setOrgDropdown(false);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-950/50 transition-colors flex items-center justify-between"
              >
                <span className="text-gray-200">{m.organization.name}</span>
                <span className={`text-xs ${ROLE_COLORS[m.role]}`}>{m.role}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`sidebar-link ${pathname.startsWith(href) ? 'active' : ''}`}
          >
            <Icon size={18} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>

      {/* User footer */}
      <div className="p-3 border-t border-indigo-900/20">
        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-indigo-950/30">
          <div className="min-w-0">
            <p className="text-sm text-gray-300 truncate">
              {user?.email || 'user@example.com'}
            </p>
          </div>
          <button
            onClick={signOut}
            className="text-gray-500 hover:text-rose-400 transition-colors flex-shrink-0 ml-2"
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
