'use client';
// frontend/src/app/(app)/workflows/new/page.tsx

import React, { useState } from 'react';
import { useMutation } from '@apollo/client';
import { CREATE_WORKFLOW, UPSERT_WORKFLOW_STEPS, UPSERT_WORKFLOW_TRIGGERS } from '@/lib/graphql/queries';
import { useAuth } from '@/lib/auth-context';
import { WorkflowBuilder } from '@/components/WorkflowBuilder';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, Workflow } from 'lucide-react';
import Link from 'next/link';

export default function NewWorkflowPage() {
  const { currentOrg, currentRole } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const [createWorkflow] = useMutation(CREATE_WORKFLOW);
  const [upsertSteps] = useMutation(UPSERT_WORKFLOW_STEPS);
  const [upsertTriggers] = useMutation(UPSERT_WORKFLOW_TRIGGERS);

  if (currentRole === 'viewer') {
    router.push('/workflows');
    return null;
  }

  const handleSave = async (steps: any[], triggers: any[]) => {
    if (!name.trim()) { toast.error('Workflow name is required'); return; }
    if (!currentOrg) { toast.error('No organization selected'); return; }
    setSaving(true);

    try {
      // 1. Create workflow
      const { data: wData } = await createWorkflow({
        variables: {
          orgId: currentOrg.organization.id,
          name: name.trim(),
          description: description.trim() || null,
        },
      });

      const workflowId = wData.insert_workflows_one.id;

      // 2. Upsert steps
      if (steps.length > 0) {
        await upsertSteps({
          variables: {
            workflowId,
            steps: steps.map((s, i) => ({
              workflow_id: workflowId,
              step_order: i,
              step_type: s.step_type,
              config: {
                ...s.config,
                ...(s.run_if ? { run_if: s.run_if } : {}),
              },
            })),
          },
        });
      }

      // 3. Upsert triggers
      if (triggers.length > 0) {
        await upsertTriggers({
          variables: {
            workflowId,
            triggers: triggers.map(t => ({
              workflow_id: workflowId,
              trigger_type: t.type,
              config: t.config || {},
            })),
          },
        });
      }

      toast.success('Workflow created!');
      router.push(`/workflows/${workflowId}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save workflow');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/workflows" className="p-2 text-gray-500 hover:text-gray-300 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold gradient-text">New Workflow</h1>
          <p className="text-gray-400 text-sm">Build your AI agent pipeline</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Workflow metadata */}
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-center gap-2 mb-3">
            <Workflow size={18} className="text-indigo-400" />
            <h2 className="text-sm font-semibold text-gray-300">Workflow Details</h2>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Name *</label>
            <input
              id="workflow-name-input"
              className="input-field"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Customer Risk Workflow"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Description</label>
            <textarea
              className="input-field min-h-[60px] resize-none"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Classify customer risk using AI, with approval gate before writing results"
            />
          </div>
        </div>

        {/* Builder */}
        <div className="glass-card p-5">
          <WorkflowBuilder
            userRole={currentRole || 'viewer'}
            onSave={handleSave}
            saving={saving}
            initialTriggers={[{ type: 'manual', config: {} }]}
          />
        </div>
      </div>
    </div>
  );
}
