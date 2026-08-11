'use client';
// frontend/src/app/(app)/dashboard/page.tsx

import { useAuth } from '@/lib/auth-context';
import { QuotaIndicator } from '@/components/QuotaIndicator';
import { useQuery } from '@apollo/client';
import { GET_WORKFLOWS } from '@/lib/graphql/queries';
import Link from 'next/link';
import {
  Workflow, Plus, Play, CheckCircle2, XCircle,
  Clock, Zap, Shield, ArrowRight, Activity
} from 'lucide-react';

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: 'bg-emerald-400',
    running:   'bg-indigo-400 animate-pulse',
    paused:    'bg-amber-400 animate-pulse',
    failed:    'bg-rose-400',
    pending:   'bg-gray-500',
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status] || 'bg-gray-500'}`} />;
}

export default function DashboardPage() {
  const { currentOrg, currentRole, user } = useAuth();
  const orgId = currentOrg?.organization.id;

  const { data, loading } = useQuery(GET_WORKFLOWS, {
    variables: { orgId },
    skip: !orgId,
  });

  const workflows = data?.workflows || [];
  const totalRuns = workflows.reduce((acc: number, w: any) => acc + (w.workflow_runs?.length || 0), 0);
  const activeWorkflows = workflows.filter((w: any) => w.is_active).length;

  const ROLE_COLORS = { owner: 'text-amber-400', editor: 'text-blue-400', viewer: 'text-gray-400' } as any;

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold gradient-text">Dashboard</h1>
            <p className="text-gray-400 mt-1">
              Welcome back, {user?.email?.split('@')[0] || 'user'}
            </p>
          </div>
          {currentRole !== 'viewer' && (
            <Link href="/workflows/new" className="btn-primary" id="new-workflow-btn">
              <Plus size={16} />
              New Workflow
            </Link>
          )}
        </div>

        {/* Org + Role banner */}
        <div className="mt-4 flex items-center gap-3 px-4 py-3 rounded-xl bg-indigo-950/30 border border-indigo-900/20 w-fit">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500/30 to-violet-600/30 flex items-center justify-center">
            <Zap size={14} className="text-indigo-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-200">{currentOrg?.organization.name}</p>
            <div className="flex items-center gap-1">
              <Shield size={11} className={ROLE_COLORS[currentRole || 'viewer']} />
              <span className={`text-xs font-medium ${ROLE_COLORS[currentRole || 'viewer']}`}>
                {currentRole}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Stats */}
        <div className="col-span-2 space-y-6">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Total Workflows', value: workflows.length, icon: Workflow, color: 'text-indigo-400' },
              { label: 'Active', value: activeWorkflows, icon: Activity, color: 'text-emerald-400' },
              { label: 'Total Runs', value: totalRuns, icon: Play, color: 'text-violet-400' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="glass-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500">{label}</span>
                  <Icon size={16} className={color} />
                </div>
                <p className="text-2xl font-bold text-gray-100">{loading ? '—' : value}</p>
              </div>
            ))}
          </div>

          {/* Recent workflows */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Workflows</h2>
              <Link href="/workflows" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                View all <ArrowRight size={12} />
              </Link>
            </div>

            {loading ? (
              <div className="flex justify-center py-8"><div className="spinner" /></div>
            ) : workflows.length === 0 ? (
              <div className="glass-card p-8 text-center">
                <Workflow size={32} className="text-gray-700 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">No workflows yet.</p>
                {currentRole !== 'viewer' && (
                  <Link href="/workflows/new" className="btn-primary mt-4 inline-flex">
                    <Plus size={14} />Create your first
                  </Link>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {workflows.slice(0, 5).map((w: any) => {
                  const latestRun = w.workflow_runs?.[0];
                  return (
                    <Link
                      key={w.id}
                      href={`/workflows/${w.id}`}
                      className="glass-card glass-card-hover p-4 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-indigo-950/60 flex items-center justify-center flex-shrink-0">
                          <Workflow size={14} className="text-indigo-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-200 truncate">{w.name}</p>
                          <p className="text-xs text-gray-500">
                            {w.workflow_steps?.length || 0} steps ·{' '}
                            {w.workflow_triggers?.map((t: any) => t.trigger_type).join(', ')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {latestRun && (
                          <div className="flex items-center gap-1.5">
                            <StatusDot status={latestRun.status} />
                            <span className="text-xs text-gray-500 capitalize">{latestRun.status}</span>
                          </div>
                        )}
                        <ArrowRight size={14} className="text-gray-600" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          <QuotaIndicator />

          {/* Role permissions card */}
          <div className="glass-card p-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Shield size={14} /> Permissions
            </h3>
            <div className="space-y-2">
              {[
                { label: 'View workflows', allowed: true },
                { label: 'Create/edit workflows', allowed: currentRole !== 'viewer' },
                { label: 'Trigger runs', allowed: currentRole !== 'viewer' },
                { label: 'Approve gates', allowed: currentRole !== 'viewer' },
                { label: 'Add db_write/notify', allowed: currentRole === 'owner' },
                { label: 'Manage members', allowed: currentRole === 'owner' },
                { label: 'Webhook/scheduled triggers', allowed: currentRole === 'owner' },
              ].map(({ label, allowed }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">{label}</span>
                  {allowed
                    ? <CheckCircle2 size={13} className="text-emerald-400" />
                    : <XCircle size={13} className="text-gray-600" />
                  }
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
