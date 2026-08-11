'use client';
// frontend/src/app/(app)/settings/page.tsx

import { useAuth } from '@/lib/auth-context';
import { Shield, Users, Settings, Copy, Key } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const { currentOrg, currentRole, user, orgs } = useAuth();

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold gradient-text mb-6">Settings</h1>

      {/* Current user */}
      <div className="glass-card p-5 mb-4">
        <div className="flex items-center gap-2 mb-4">
          <Key size={16} className="text-indigo-400" />
          <h2 className="text-sm font-semibold text-gray-300">Account</h2>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between py-2 border-b border-white/5">
            <span className="text-sm text-gray-400">Email</span>
            <span className="text-sm text-gray-200">{user?.email}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-gray-400">User ID</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-mono">{user?.id?.slice(0, 16)}…</span>
              <button
                onClick={() => { navigator.clipboard.writeText(user?.id || ''); toast.success('Copied!'); }}
                className="text-gray-600 hover:text-gray-400"
              >
                <Copy size={12} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Organizations */}
      <div className="glass-card p-5 mb-4">
        <div className="flex items-center gap-2 mb-4">
          <Users size={16} className="text-indigo-400" />
          <h2 className="text-sm font-semibold text-gray-300">Your Organizations</h2>
        </div>
        <div className="space-y-2">
          {orgs.map(m => (
            <div key={m.organization.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
              <div>
                <p className="text-sm text-gray-200">{m.organization.name}</p>
                <p className="text-xs text-gray-500 font-mono">{m.organization.id.slice(0, 16)}…</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full
                  ${m.role === 'owner' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                    m.role === 'editor' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                    'bg-gray-500/10 text-gray-400 border border-gray-500/20'}`}>
                  {m.role}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Permissions reference */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Shield size={16} className="text-indigo-400" />
          <h2 className="text-sm font-semibold text-gray-300">Permission Reference</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-2 text-gray-500">Action</th>
                <th className="text-center py-2 text-amber-400">Owner</th>
                <th className="text-center py-2 text-blue-400">Editor</th>
                <th className="text-center py-2 text-gray-400">Viewer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {[
                ['View workflows + runs', true, true, true],
                ['Create/edit workflows', true, true, false],
                ['Add llm_call/http_request', true, true, false],
                ['Add db_write/notify steps', true, false, false],
                ['Add webhook/scheduled triggers', true, false, false],
                ['Trigger runs', true, true, false],
                ['Approve approval_gate', true, true, false],
                ['Manage members', true, false, false],
              ].map(([action, owner, editor, viewer]) => (
                <tr key={String(action)}>
                  <td className="py-2 text-gray-400">{action}</td>
                  {[owner, editor, viewer].map((allowed, i) => (
                    <td key={i} className="text-center py-2">
                      {allowed ? '✓' : <span className="text-gray-700">✗</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-gray-600">
          Layer 1 permissions are enforced in Hasura row-level policies. Layer 2 permissions (db_write, approval gates) are enforced in Action handler code.
        </p>
      </div>
    </div>
  );
}
