'use client';
// frontend/src/components/RunMonitor.tsx
// Live step-by-step run monitor using GraphQL subscriptions

import React from 'react';
import { useSubscription, useMutation, useQuery } from '@apollo/client';
import {
  STEP_RUNS_SUBSCRIPTION,
  WORKFLOW_RUN_STATUS_SUBSCRIPTION,
  APPROVE_STEP,
  GET_WORKFLOW_RUN,
} from '@/lib/graphql/queries';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'react-hot-toast';
import {
  Brain, Globe, Database, Bell, GitBranch, Lock,
  CheckCircle2, XCircle, Clock, RefreshCw, Play,
  ThumbsUp, AlertCircle, Loader2, ChevronDown, ChevronUp
} from 'lucide-react';

// ─── Step Type Icons & Labels ───────────────────────────────

const STEP_ICONS: Record<string, React.ReactNode> = {
  llm_call:           <Brain size={16} />,
  http_request:       <Globe size={16} />,
  db_write:           <Database size={16} />,
  notify:             <Bell size={16} />,
  conditional_branch: <GitBranch size={16} />,
  approval_gate:      <Lock size={16} />,
};

const STEP_LABELS: Record<string, string> = {
  llm_call:           'LLM Call',
  http_request:       'HTTP Request',
  db_write:           'DB Write',
  notify:             'Notify',
  conditional_branch: 'Conditional',
  approval_gate:      'Approval Gate',
};

const STEP_COLORS: Record<string, string> = {
  llm_call:           'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
  http_request:       'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  db_write:           'text-amber-400 bg-amber-500/10 border-amber-500/20',
  notify:             'text-violet-400 bg-violet-500/10 border-violet-500/20',
  conditional_branch: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  approval_gate:      'text-pink-400 bg-pink-500/10 border-pink-500/20',
};

// ─── Status Indicator ────────────────────────────────────────

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed': return <CheckCircle2 size={16} className="text-emerald-400" />;
    case 'failed':    return <XCircle size={16} className="text-rose-400" />;
    case 'running':   return <Loader2 size={16} className="text-indigo-400 animate-spin" />;
    case 'paused':    return <Clock size={16} className="text-amber-400" style={{ animation: 'pulse 1.5s infinite' }} />;
    case 'skipped':   return <RefreshCw size={16} className="text-gray-500" />;
    default:          return <Play size={16} className="text-gray-600" />;
  }
}

// ─── Step Row ────────────────────────────────────────────────

function StepRow({
  stepRun,
  canApproveSteps,
  onApprove,
  approving,
}: {
  stepRun: any;
  canApproveSteps: boolean;
  onApprove: (id: string) => void;
  approving: boolean;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const { status, workflow_step, output, error, attempt_count, approved_by, approved_at } = stepRun;
  const stepType = workflow_step?.step_type || 'unknown';
  const colorClass = STEP_COLORS[stepType] || 'text-gray-400 bg-gray-500/10 border-gray-500/20';
  const isPaused = status === 'paused';
  const hasDetail = output || error || attempt_count > 1;

  return (
    <div
      className={`glass-card p-4 transition-all duration-300 ${
        isPaused ? 'border-amber-500/40 shadow-amber-500/10 shadow-lg' : ''
      } ${status === 'running' ? 'border-indigo-500/40' : ''}`}
    >
      {/* Header Row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`flex items-center justify-center w-8 h-8 rounded-lg border ${colorClass} flex-shrink-0`}>
            {STEP_ICONS[stepType]}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-200">
                {workflow_step?.config?.name || STEP_LABELS[stepType] || stepType}
              </span>
              {attempt_count > 1 && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  attempt {attempt_count}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <StatusIcon status={status} />
              <span className={`text-xs status-${status}`}>{status}</span>
              {stepRun.completed_at && stepRun.started_at && (
                <span className="text-xs text-gray-600">
                  {((new Date(stepRun.completed_at).getTime() - new Date(stepRun.started_at).getTime()) / 1000).toFixed(1)}s
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Approve button — Layer 2b UI (actual check happens in backend) */}
          {isPaused && canApproveSteps && (
            <button
              onClick={() => onApprove(stepRun.id)}
              disabled={approving}
              className="btn-approve text-sm"
              id={`approve-btn-${stepRun.id}`}
            >
              {approving ? <Loader2 size={14} className="animate-spin" /> : <ThumbsUp size={14} />}
              {approving ? 'Approving…' : 'Approve'}
            </button>
          )}

          {/* Viewer sees paused but can't approve */}
          {isPaused && !canApproveSteps && (
            <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertCircle size={12} className="text-amber-400" />
              <span className="text-xs text-amber-400">Awaiting approval</span>
            </div>
          )}

          {/* Expand detail */}
          {hasDetail && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-gray-500 hover:text-gray-300 transition-colors"
            >
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          )}
        </div>
      </div>

      {/* Approved-by indicator */}
      {approved_by && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400/70">
          <CheckCircle2 size={11} />
          <span>Approved at {new Date(approved_at).toLocaleTimeString()}</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-2 p-2 rounded-lg bg-rose-500/5 border border-rose-500/20">
          <p className="text-xs text-rose-400 font-mono break-all">{error}</p>
        </div>
      )}

      {/* Expandable Output */}
      {expanded && output && (
        <div className="mt-3 p-3 rounded-lg bg-black/20 border border-white/5">
          <p className="text-xs text-gray-500 mb-1 font-mono uppercase tracking-wide">Output</p>
          <pre className="text-xs text-gray-300 overflow-x-auto whitespace-pre-wrap break-all font-mono">
            {typeof output === 'string' ? output : JSON.stringify(output, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Run Status Banner ───────────────────────────────────────

function RunStatusBanner({ status }: { status: string }) {
  const configs = {
    pending:   { text: 'Preparing…',         className: 'bg-gray-800/50 border-gray-700 text-gray-400' },
    running:   { text: '⚡ Running',          className: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300' },
    paused:    { text: '⏸ Awaiting Approval', className: 'bg-amber-500/10 border-amber-500/30 text-amber-300' },
    completed: { text: '✓ Completed',         className: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' },
    failed:    { text: '✗ Failed',            className: 'bg-rose-500/10 border-rose-500/30 text-rose-300' },
  } as any;

  const cfg = configs[status] || configs.pending;
  return (
    <div className={`flex items-center justify-center py-2 px-4 rounded-xl border text-sm font-semibold ${cfg.className}`}>
      {cfg.text}
    </div>
  );
}

// ─── Main RunMonitor Component ───────────────────────────────

interface RunMonitorProps {
  workflowRunId: string;
}

export function RunMonitor({ workflowRunId }: RunMonitorProps) {
  const { currentRole } = useAuth();
  const canApproveSteps = currentRole === 'owner' || currentRole === 'editor';
  const [approvingId, setApprovingId] = React.useState<string | null>(null);

  // Live subscription for step updates
  const { data: stepData, loading: stepLoading } = useSubscription(STEP_RUNS_SUBSCRIPTION, {
    variables: { workflowRunId },
  });

  // Live subscription for overall run status
  const { data: runData } = useSubscription(WORKFLOW_RUN_STATUS_SUBSCRIPTION, {
    variables: { workflowRunId },
  });

  const [approveStep, { loading: approving }] = useMutation(APPROVE_STEP, {
    onCompleted: (data) => {
      if (data.approveStep.success) {
        toast.success('Step approved — workflow resuming!');
      } else {
        toast.error(data.approveStep.message || 'Approval failed');
      }
      setApprovingId(null);
    },
    onError: (err) => {
      toast.error(err.message);
      setApprovingId(null);
    },
  });

  const handleApprove = (stepRunId: string) => {
    setApprovingId(stepRunId);
    approveStep({ variables: { stepRunId } });
  };

  const stepRuns = stepData?.step_runs || [];
  const runStatus = runData?.workflow_runs_by_pk?.status || 'pending';

  const completedCount = stepRuns.filter((s: any) => s.status === 'completed').length;
  const totalCount = stepRuns.length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            Live Execution
          </h3>
          {totalCount > 0 && (
            <p className="text-xs text-gray-600 mt-0.5">
              {completedCount} / {totalCount} steps
            </p>
          )}
        </div>
        <RunStatusBanner status={runStatus} />
      </div>

      {/* Loading */}
      {stepLoading && stepRuns.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <div className="spinner" />
        </div>
      )}

      {/* Step Runs */}
      <div className="space-y-2">
        {stepRuns.map((stepRun: any, i: number) => (
          <React.Fragment key={stepRun.id}>
            <StepRow
              stepRun={stepRun}
              canApproveSteps={canApproveSteps}
              onApprove={handleApprove}
              approving={approvingId === stepRun.id && approving}
            />
            {/* Connector line between steps */}
            {i < stepRuns.length - 1 && <div className="step-connector" />}
          </React.Fragment>
        ))}
      </div>

      {stepRuns.length === 0 && !stepLoading && (
        <div className="text-center py-8 text-gray-600 text-sm">
          No steps yet — subscription connected
        </div>
      )}
    </div>
  );
}
