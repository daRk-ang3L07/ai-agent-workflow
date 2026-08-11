'use client';
// frontend/src/components/QuotaIndicator.tsx

import { useQuery } from '@apollo/client';
import { GET_ORG_USAGE } from '@/lib/graphql/queries';
import { useAuth } from '@/lib/auth-context';
import { BarChart3, Zap, Clock, AlertTriangle } from 'lucide-react';

export function QuotaIndicator() {
  const { currentOrg } = useAuth();
  const orgId = currentOrg?.organization.id;

  const { data, loading } = useQuery(GET_ORG_USAGE, {
    variables: { orgId },
    skip: !orgId,
    pollInterval: 10000, // Refresh every 10s
  });

  const usage = data?.org_usage_this_month?.[0];

  if (!usage && !loading) return null;

  const allowed = usage?.quota_calls_allowed || currentOrg?.organization.quota_calls_allowed || 100;
  const used = usage?.quota_calls_used || currentOrg?.organization.quota_calls_used || 0;
  const pending = usage?.quota_calls_pending || currentOrg?.organization.quota_calls_pending || 0;
  const runsThisMonth = usage?.runs_this_month || 0;
  const avgDuration = usage?.avg_run_duration_seconds;

  const usagePercent = Math.min(100, Math.round(((used + pending) / allowed) * 100));
  const isNearLimit = usagePercent >= 80;
  const isAtLimit = usagePercent >= 100;

  const barColor = isAtLimit
    ? 'from-rose-500 to-red-600'
    : isNearLimit
    ? 'from-amber-500 to-orange-500'
    : 'from-indigo-500 to-violet-600';

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 size={18} className="text-indigo-400" />
          <span className="text-sm font-semibold text-gray-200">Usage & Quota</span>
        </div>
        {isNearLimit && !isAtLimit && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle size={12} className="text-amber-400" />
            <span className="text-xs text-amber-400 font-medium">Near limit</span>
          </div>
        )}
        {isAtLimit && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20">
            <AlertTriangle size={12} className="text-rose-400" />
            <span className="text-xs text-rose-400 font-medium">At limit</span>
          </div>
        )}
      </div>

      {/* Quota Bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-gray-400 mb-1.5">
          <span className="flex items-center gap-1">
            <Zap size={11} className="text-indigo-400" />
            {used} used
            {pending > 0 && <span className="text-amber-400/80"> + {pending} pending</span>}
          </span>
          <span>{allowed} allowed</span>
        </div>
        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-full bg-gradient-to-r ${barColor} rounded-full transition-all duration-700`}
            style={{ width: `${usagePercent}%` }}
          />
          {pending > 0 && (
            <div
              className="h-full bg-amber-500/40 rounded-full"
              style={{
                width: `${Math.min(100, Math.round((pending / allowed) * 100))}%`,
                marginTop: '-8px',
              }}
            />
          )}
        </div>
        <div className="flex justify-end mt-1">
          <span className="text-xs text-gray-500">{usagePercent}%</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-indigo-950/30 rounded-lg p-2.5">
          <p className="text-xs text-gray-500 mb-0.5">Runs this month</p>
          <p className="text-lg font-bold text-gray-100">{runsThisMonth}</p>
        </div>
        <div className="bg-indigo-950/30 rounded-lg p-2.5">
          <div className="flex items-center gap-1 mb-0.5">
            <Clock size={11} className="text-gray-500" />
            <p className="text-xs text-gray-500">Avg duration</p>
          </div>
          <p className="text-lg font-bold text-gray-100">
            {avgDuration ? `${avgDuration.toFixed(1)}s` : '—'}
          </p>
        </div>
      </div>
    </div>
  );
}
