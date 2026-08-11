'use client';
// frontend/src/app/(app)/workflows/[id]/edit/page.tsx

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import {
  GET_WORKFLOW_DETAIL, UPDATE_WORKFLOW,
  UPSERT_WORKFLOW_STEPS, UPSERT_WORKFLOW_TRIGGERS
} from '@/lib/graphql/queries';
import { useAuth } from '@/lib/auth-context';
import { WorkflowBuilder } from '@/components/WorkflowBuilder';
import { useRouter, useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function EditWorkflowPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();
  const { currentRole } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const { data, loading } = useQuery(GET_WORKFLOW_DETAIL, { variables: { id } });
  const [updateWorkflow] = useMutation(UPDATE_WORKFLOW);
  const [upsertSteps] = useMutation(UPSERT_WORKFLOW_STEPS);
  const [upsertTriggers] = useMutation(UPSERT_WORKFLOW_TRIGGERS);

  const workflow = data?.workflows_by_pk;

  useEffect(() => {
    if (workflow) {
      setName(workflow.name);
      setDescription(workflow.description || '');
    }
  }, [workflow]);

  if (currentRole === 'viewer') { router.push('/workflows'); return null; }
  if (loading) return <div className="flex justify-center py-16"><div className="spinner w-8 h-8" /></div>;
  if (!workflow) return <div className="text-gray-400 py-16 text-center">Workflow not found or access denied.</div>;

  const initialSteps = workflow.workflow_steps?.map((s: any) => ({
    id: s.id,
    step_type: s.step_type,
    config: s.config,
    run_if: s.config?.run_if,
  })) || [];

  const initialTriggers = workflow.workflow_triggers?.map((t: any) => ({
    type: t.trigger_type,
    config: t.config || {},
  })) || [{ type: 'manual', config: {} }];

  const handleSave = async (steps: any[], triggers: any[]) => {
    if (!name.trim()) { toast.error('Name required'); return; }
    setSaving(true);
    try {
      await updateWorkflow({ variables: { id, name: name.trim(), description: description.trim() || null } });

      await upsertSteps({
        variables: {
          workflowId: id,
          steps: steps.map((s, i) => ({
            workflow_id: id,
            step_order: i,
            step_type: s.step_type,
            config: { ...s.config, ...(s.run_if ? { run_if: s.run_if } : {}) },
          })),
        },
      });

      await upsertTriggers({
        variables: {
          workflowId: id,
          triggers: triggers.map(t => ({
            workflow_id: id,
            trigger_type: t.type,
            config: t.config || {},
          })),
        },
      });

      toast.success('Workflow saved!');
      router.push(`/workflows/${id}`);
    } catch (err: any) {
      toast.error(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/workflows/${id}`} className="p-2 text-gray-500 hover:text-gray-300">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold gradient-text">Edit Workflow</h1>
          <p className="text-gray-400 text-sm">{workflow.name}</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="glass-card p-5 space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Name</label>
            <input className="input-field" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Description</label>
            <textarea
              className="input-field min-h-[60px] resize-none"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
        </div>

        <div className="glass-card p-5">
          <WorkflowBuilder
            initialSteps={initialSteps}
            initialTriggers={initialTriggers}
            userRole={currentRole || 'viewer'}
            onSave={handleSave}
            saving={saving}
          />
        </div>
      </div>
    </div>
  );
}
