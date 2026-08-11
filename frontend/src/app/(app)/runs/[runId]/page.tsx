'use client';
// frontend/src/app/(app)/runs/[runId]/page.tsx — Live Run Monitor Page

import { useParams } from 'next/navigation';
import { useQuery } from '@apollo/client';
import { GET_WORKFLOW_RUN } from '@/lib/graphql/queries';
import { RunMonitor } from '@/components/RunMonitor';
import Link from 'next/link';
import { ArrowLeft, Clock, Webhook, Calendar, MousePointer, Activity } from 'lucide-react';

const TRIGGER_ICONS: Record<string, any> = {
  manual: MousePointer, webhook: Webhook, scheduled: Calendar, db_event: Activity,
};

export default function RunPage() {
  const params = useParams();
  const runId = params?.runId as string;

  const { data, loading } = useQuery(GET_WORKFLOW_RUN, {
    variables: { runId },
    fetchPolicy: 'network-only',
  });

  const run = data?.workflow_runs_by_pk;

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="spinner w-8 h-8" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400">Run not found or access denied.</p>
        <Link href="/workflows" className="btn-secondary mt-4 inline-flex">
          <ArrowLeft size={14} /> Back to Workflows
        </Link>
      </div>
    );
  }

  const TriggerIcon = TRIGGER_ICONS[run.trigger_type] || MousePointer;

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/workflows/${run.workflow?.id}`} className="p-2 text-gray-500 hover:text-gray-300">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-100">{run.workflow?.name}</h1>
          <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
            <TriggerIcon size={11} />
            <span className="capitalize">{run.trigger_type} trigger</span>
            <span>·</span>
            <Clock size={11} />
            <span>{new Date(run.created_at).toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Live monitor — the heart of the UI */}
      <RunMonitor workflowRunId={runId} />
    </div>
  );
}
