'use client';
// frontend/src/app/(app)/workflows/page.tsx — Workflows list

import { useQuery, useMutation } from '@apollo/client';
import { GET_WORKFLOWS, TRIGGER_WORKFLOW_RUN, DELETE_WORKFLOW } from '@/lib/graphql/queries';
import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  Workflow, Plus, Play, Trash2, Settings2, ArrowRight,
  Brain, Globe, Database, Bell, GitBranch, Lock,
  Webhook, Calendar, MousePointer, Activity, CheckCircle2,
  Clock, XCircle, Zap
} from 'lucide-react';

const STEP_ICONS: Record<string, any> = {
  llm_call: Brain, http_request: Globe, db_write: Database,
  notify: Bell, conditional_branch: GitBranch, approval_gate: Lock,
};

const TRIGGER_ICONS: Record<string, any> = {
  manual: MousePointer, webhook: Webhook, scheduled: Calendar, db_event: Activity,
};

const STATUS_CONFIG: Record<string, { icon: any; text: string; color: string }> = {
  completed: { icon: CheckCircle2, text: 'Completed', color: 'text-emerald-400' },
  running:   { icon: Zap,          text: 'Running',   color: 'text-indigo-400'  },
  paused:    { icon: Clock,        text: 'Paused',    color: 'text-amber-400'   },
  failed:    { icon: XCircle,      text: 'Failed',    color: 'text-rose-400'    },
  pending:   { icon: Clock,        text: 'Pending',   color: 'text-gray-400'    },
};

export default function WorkflowsPage() {
  const router = useRouter();
  const { currentOrg, currentRole } = useAuth();
  const orgId = currentOrg?.organization.id;

  const { data, loading, refetch } = useQuery(GET_WORKFLOWS, {
    variables: { orgId },
    skip: !orgId,
  });

  const [triggerRun] = useMutation(TRIGGER_WORKFLOW_RUN, {
    onCompleted: (data) => {
      if (data.triggerWorkflowRun.success) {
        toast.success('Workflow started!');
        router.push(`/runs/${data.triggerWorkflowRun.workflow_run_id}`);
      } else {
        toast.error(data.triggerWorkflowRun.message || 'Failed to start');
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const [deleteWorkflow] = useMutation(DELETE_WORKFLOW, {
    onCompleted: () => { toast.success('Workflow deleted'); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const workflows = data?.workflows || [];

  const handleRun = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (currentRole === 'viewer') {
      toast.error('Viewers cannot trigger workflow runs');
      return;
    }
    triggerRun({ variables: { workflowId: id } });
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (!confirm('Delete this workflow and all its data?')) return;
    deleteWorkflow({ variables: { id } });
  };

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold gradient-text">Workflows</h1>
          <p className="text-gray-400 mt-1">{currentOrg?.organization.name}</p>
        </div>
        {currentRole !== 'viewer' && (
          <Link href="/workflows/new" className="btn-primary" id="new-workflow-btn">
            <Plus size={16} />
            New Workflow
          </Link>
        )}
      </div>

      {/* Workflows list */}
      {loading ? (
        <div className="flex justify-center py-16"><div className="spinner w-8 h-8" /></div>
      ) : workflows.length === 0 ? (
        <div className="glass-card p-16 text-center">
          <Workflow size={48} className="text-gray-700 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-300 mb-2">No workflows yet</h3>
          <p className="text-gray-500 mb-6">Build your first AI agent workflow</p>
          {currentRole !== 'viewer' && (
            <Link href="/workflows/new" className="btn-primary inline-flex">
              <Plus size={16} />
              Create Workflow
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {workflows.map((w: any) => {
            const latestRun = w.workflow_runs?.[0];
            const statusConfig = latestRun ? STATUS_CONFIG[latestRun.status] : null;
            const StatusIcon = statusConfig?.icon;

            return (
              <div key={w.id} className="glass-card glass-card-hover p-5">
                <div className="flex flex-col md:flex-row items-start justify-between gap-4">
                  {/* Left: info */}
                  <Link href={`/workflows/${w.id}`} className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-base font-semibold text-gray-100 hover:text-indigo-300 transition-colors">
                        {w.name}
                      </h3>
                      {!w.is_active && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-500">inactive</span>
                      )}
                    </div>

                    {w.description && (
                      <p className="text-sm text-gray-500 mb-3 truncate">{w.description}</p>
                    )}

                    {/* Steps preview */}
                    <div className="flex items-center gap-1 flex-wrap">
                      {w.workflow_steps?.slice(0, 6).map((step: any) => {
                        const Icon = STEP_ICONS[step.step_type] || Workflow;
                        return (
                          <div
                            key={step.id}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-900/60 border border-white/5"
                          >
                            <Icon size={11} className="text-gray-400" />
                            <span className="text-xs text-gray-500">{step.step_type.replace('_', ' ')}</span>
                          </div>
                        );
                      })}
                      {w.workflow_steps?.length > 6 && (
                        <span className="text-xs text-gray-600">+{w.workflow_steps.length - 6} more</span>
                      )}
                    </div>

                    {/* Triggers */}
                    <div className="flex items-center gap-2 mt-2">
                      {w.workflow_triggers?.map((t: any) => {
                        const TIcon = TRIGGER_ICONS[t.trigger_type] || MousePointer;
                        return (
                          <div key={t.id} className="flex items-center gap-1 text-xs text-gray-500">
                            <TIcon size={11} />
                            <span>{t.trigger_type}</span>
                          </div>
                        );
                      })}
                    </div>
                  </Link>

                  {/* Right: actions */}
                  <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                    {/* Latest run status */}
                    {statusConfig && StatusIcon && (
                      <div className={`flex items-center gap-1 text-xs ${statusConfig.color}`}>
                        <StatusIcon size={13} />
                        <span>{statusConfig.text}</span>
                      </div>
                    )}

                    {/* View latest run */}
                    {latestRun && (
                      <Link
                        href={`/runs/${latestRun.id}`}
                        className="btn-secondary text-xs py-1.5 px-3"
                        onClick={e => e.stopPropagation()}
                      >
                        View run
                      </Link>
                    )}

                    {/* Run button — hidden for viewers */}
                    {currentRole !== 'viewer' && (
                      <button
                        id={`run-btn-${w.id}`}
                        onClick={(e) => handleRun(w.id, e)}
                        className="btn-primary text-xs py-1.5 px-3"
                        title="Run this workflow"
                      >
                        <Play size={13} />
                        Run
                      </button>
                    )}

                    {/* Edit */}
                    {currentRole !== 'viewer' && (
                      <Link
                        href={`/workflows/${w.id}/edit`}
                        className="p-2 text-gray-500 hover:text-indigo-400 transition-colors"
                        onClick={e => e.stopPropagation()}
                      >
                        <Settings2 size={16} />
                      </Link>
                    )}

                    {/* Delete (owner only) */}
                    {currentRole === 'owner' && (
                      <button
                        onClick={(e) => handleDelete(w.id, e)}
                        className="p-2 text-gray-600 hover:text-rose-400 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
