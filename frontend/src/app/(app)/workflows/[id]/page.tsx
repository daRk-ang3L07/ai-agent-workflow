'use client';
// frontend/src/app/(app)/workflows/[id]/page.tsx — Workflow detail + Run button

import { useQuery, useMutation } from '@apollo/client';
import { GET_WORKFLOW_DETAIL, TRIGGER_WORKFLOW_RUN } from '@/lib/graphql/queries';
import { useAuth } from '@/lib/auth-context';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Play, Settings2, Brain, Globe, Database,
  Bell, GitBranch, Lock, Webhook, Calendar, MousePointer,
  Activity, CheckCircle2, Clock, XCircle, Copy, ExternalLink
} from 'lucide-react';

const STEP_ICONS: Record<string, any> = {
  llm_call: Brain, http_request: Globe, db_write: Database,
  notify: Bell, conditional_branch: GitBranch, approval_gate: Lock,
};

const STEP_COLORS: Record<string, string> = {
  llm_call: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
  http_request: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  db_write: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  notify: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
  conditional_branch: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  approval_gate: 'text-pink-400 bg-pink-500/10 border-pink-500/20',
};

const STEP_LABELS: Record<string, string> = {
  llm_call: 'LLM Call', http_request: 'HTTP Request', db_write: 'DB Write',
  notify: 'Notify', conditional_branch: 'Conditional', approval_gate: 'Approval Gate',
};

export default function WorkflowDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();
  const { currentRole } = useAuth();

  const { data, loading } = useQuery(GET_WORKFLOW_DETAIL, { variables: { id } });

  const [triggerRun, { loading: triggering }] = useMutation(TRIGGER_WORKFLOW_RUN, {
    onCompleted: (d) => {
      if (d.triggerWorkflowRun.success) {
        toast.success('Workflow started!');
        router.push(`/runs/${d.triggerWorkflowRun.workflow_run_id}`);
      } else {
        toast.error(d.triggerWorkflowRun.message || 'Failed to start');
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const workflow = data?.workflows_by_pk;

  if (loading) return <div className="flex justify-center py-16"><div className="spinner w-8 h-8" /></div>;
  if (!workflow) return <div className="text-gray-400 py-16 text-center">Workflow not found or access denied.</div>;

  const webhookTrigger = workflow.workflow_triggers?.find((t: any) => t.trigger_type === 'webhook');
  const webhookUrl = webhookTrigger
    ? `${process.env.NEXT_PUBLIC_FUNCTIONS_URL}/webhook-trigger`
    : null;

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-start gap-3">
          <Link href="/workflows" className="p-2 text-gray-500 hover:text-gray-300 mt-0.5">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-100">{workflow.name}</h1>
            {workflow.description && (
              <p className="text-gray-400 text-sm mt-0.5">{workflow.description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {currentRole !== 'viewer' && (
            <Link href={`/workflows/${id}/edit`} className="btn-secondary text-sm">
              <Settings2 size={15} />
              Edit
            </Link>
          )}
          {currentRole !== 'viewer' && (
            <button
              id="run-workflow-btn"
              onClick={() => triggerRun({ variables: { workflowId: id } })}
              disabled={triggering}
              className="btn-primary"
            >
              {triggering ? <div className="spinner w-4 h-4" /> : <Play size={16} />}
              {triggering ? 'Starting…' : 'Run Now'}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Steps column */}
        <div className="md:col-span-2 space-y-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Steps ({workflow.workflow_steps?.length})</h2>
          {workflow.workflow_steps?.map((step: any, i: number) => {
            const Icon = STEP_ICONS[step.step_type] || Lock;
            const colorClass = STEP_COLORS[step.step_type] || 'text-gray-400 bg-gray-500/10 border-gray-500/20';
            return (
              <div key={step.id}>
                <div className="glass-card p-4 flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-indigo-950/60 text-indigo-400 text-xs font-bold flex items-center justify-center flex-shrink-0">
                    {i + 1}
                  </span>
                  <div className={`w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                    <Icon size={15} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-200">{STEP_LABELS[step.step_type]}</p>
                    <p className="text-xs text-gray-500 truncate font-mono">
                      {step.config?.prompt?.slice(0, 60) ||
                       step.config?.url ||
                       step.config?.description ||
                       step.config?.message ||
                       JSON.stringify(step.config).slice(0, 60)}
                    </p>
                  </div>
                  {step.config?.run_if && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20 flex-shrink-0">
                      if {step.config.run_if}
                    </span>
                  )}
                </div>
                {i < workflow.workflow_steps.length - 1 && <div className="step-connector" />}
              </div>
            );
          })}
        </div>

        {/* Right panel */}
        <div className="space-y-4">
          {/* Triggers */}
          <div className="glass-card p-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Triggers</h3>
            <div className="space-y-2">
              {workflow.workflow_triggers?.map((t: any) => {
                const icons: any = { manual: MousePointer, webhook: Webhook, scheduled: Calendar, db_event: Activity };
                const TIcon = icons[t.trigger_type] || MousePointer;
                return (
                  <div key={t.id} className="flex items-center gap-2">
                    <TIcon size={13} className="text-indigo-400" />
                    <span className="text-sm text-gray-300 capitalize">{t.trigger_type}</span>
                    {t.trigger_type === 'scheduled' && t.config?.cron && (
                      <code className="text-xs text-gray-500 font-mono">{t.config.cron}</code>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Webhook URL */}
            {webhookTrigger && (
              <div className="mt-3 p-2 rounded-lg bg-black/20 border border-white/5">
                <p className="text-xs text-gray-500 mb-1">Webhook endpoint:</p>
                <div className="flex items-center gap-1">
                  <code className="text-xs text-indigo-300 font-mono break-all flex-1">
                    POST /webhook-trigger
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `curl -X POST ${process.env.NEXT_PUBLIC_FUNCTIONS_URL}/webhook-trigger -H 'Content-Type: application/json' -d '{"workflow_id":"${id}","token":"${webhookTrigger.webhook_token}","payload":{}}'`
                      );
                      toast.success('Curl command copied!');
                    }}
                    className="text-gray-500 hover:text-gray-300"
                  >
                    <Copy size={12} />
                  </button>
                </div>
                <p className="text-xs text-gray-600 mt-1 font-mono break-all">
                  token: {webhookTrigger.webhook_token?.slice(0, 16)}…
                </p>
              </div>
            )}
          </div>

          {/* Recent runs */}
          <div className="glass-card p-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Recent Runs</h3>
            {workflow.workflow_runs?.length === 0 ? (
              <p className="text-xs text-gray-600">No runs yet</p>
            ) : (
              <div className="space-y-2">
                {workflow.workflow_runs?.map((run: any) => {
                  const statusIcons: any = {
                    completed: <CheckCircle2 size={13} className="text-emerald-400" />,
                    running: <div className="spinner w-3 h-3" />,
                    paused: <Clock size={13} className="text-amber-400" />,
                    failed: <XCircle size={13} className="text-rose-400" />,
                    pending: <Clock size={13} className="text-gray-400" />,
                  };
                  return (
                    <Link
                      key={run.id}
                      href={`/runs/${run.id}`}
                      className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 transition-colors"
                    >
                      {statusIcons[run.status]}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-300 capitalize">{run.status}</p>
                        <p className="text-xs text-gray-600">{new Date(run.created_at).toLocaleString()}</p>
                      </div>
                      <ExternalLink size={11} className="text-gray-600" />
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
