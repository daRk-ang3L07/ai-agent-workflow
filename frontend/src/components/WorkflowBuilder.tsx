'use client';
// frontend/src/components/WorkflowBuilder.tsx
// Vertical workflow step builder with DnD reordering

import React, { useState } from 'react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Brain, Globe, Database, Bell, GitBranch, Lock,
  Plus, Trash2, GripVertical, ChevronDown, ChevronUp,
  Webhook, Calendar, MousePointer, Activity,
} from 'lucide-react';

// ─── Step Type Config ────────────────────────────────────────

export const STEP_TYPES = [
  { value: 'llm_call',           label: 'LLM Call',        icon: Brain,      color: 'text-indigo-400',   ownerOnly: false },
  { value: 'http_request',       label: 'HTTP Request',    icon: Globe,      color: 'text-emerald-400',  ownerOnly: false },
  { value: 'conditional_branch', label: 'Conditional',     icon: GitBranch,  color: 'text-orange-400',   ownerOnly: false },
  { value: 'approval_gate',      label: 'Approval Gate',   icon: Lock,       color: 'text-pink-400',     ownerOnly: false },
  { value: 'db_write',           label: 'DB Write',        icon: Database,   color: 'text-amber-400',    ownerOnly: true  },
  { value: 'notify',             label: 'Notify',          icon: Bell,       color: 'text-violet-400',   ownerOnly: true  },
] as const;

export const TRIGGER_TYPES = [
  { value: 'manual',    label: 'Manual',    icon: MousePointer, ownerOnly: false },
  { value: 'webhook',   label: 'Webhook',   icon: Webhook,      ownerOnly: true  },
  { value: 'scheduled', label: 'Scheduled', icon: Calendar,     ownerOnly: true  },
  { value: 'db_event',  label: 'DB Event',  icon: Activity,     ownerOnly: true  },
] as const;

// ─── Default Configs ─────────────────────────────────────────

export function getDefaultConfig(stepType: string): Record<string, any> {
  switch (stepType) {
    case 'llm_call':
      return { prompt: 'Classify this as HIGH or LOW risk: {{input}}', system_prompt: 'You are a risk analyst.' };
    case 'http_request':
      return { method: 'GET', url: 'https://httpbin.org/get', headers: {} };
    case 'db_write':
      return { result_field: 'previous_output' };
    case 'notify':
      return { message: 'Workflow "{{workflow_name}}" notification' };
    case 'conditional_branch':
      return { condition: { field: 'previous_output', operator: 'contains', value: 'HIGH' } };
    case 'approval_gate':
      return { description: 'Approve to continue workflow execution' };
    default:
      return {};
  }
}

// ─── Step Config Editor ──────────────────────────────────────

function StepConfigEditor({
  stepType,
  config,
  onChange,
}: {
  stepType: string;
  config: Record<string, any>;
  onChange: (c: Record<string, any>) => void;
}) {
  const update = (key: string, value: any) => onChange({ ...config, [key]: value });

  switch (stepType) {
    case 'llm_call':
      return (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">System Prompt</label>
            <input
              className="input-field"
              value={config.system_prompt || ''}
              onChange={e => update('system_prompt', e.target.value)}
              placeholder="You are a helpful assistant"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Prompt <span className="text-indigo-400">— use {'{{previous_output}}'} to chain</span>
            </label>
            <textarea
              className="input-field min-h-[80px] resize-y font-mono text-xs"
              value={config.prompt || ''}
              onChange={e => update('prompt', e.target.value)}
              placeholder="Classify this as HIGH or LOW risk: {{previous_output}}"
            />
          </div>
        </div>
      );

    case 'http_request':
      return (
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="w-28">
              <label className="block text-xs text-gray-400 mb-1">Method</label>
              <select
                className="input-field"
                value={config.method || 'GET'}
                onChange={e => update('method', e.target.value)}
              >
                {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-400 mb-1">URL</label>
              <input
                className="input-field"
                value={config.url || ''}
                onChange={e => update('url', e.target.value)}
                placeholder="https://api.example.com/endpoint"
              />
            </div>
          </div>
        </div>
      );

    case 'conditional_branch':
      return (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Field to check <span className="text-gray-500">(e.g. previous_output)</span>
            </label>
            <input
              className="input-field"
              value={config.condition?.field || 'previous_output'}
              onChange={e => update('condition', { ...config.condition, field: e.target.value })}
            />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs text-gray-400 mb-1">Operator</label>
              <select
                className="input-field"
                value={config.condition?.operator || 'contains'}
                onChange={e => update('condition', { ...config.condition, operator: e.target.value })}
              >
                {['contains', 'equals', 'starts_with', 'ends_with', 'not_contains'].map(op => (
                  <option key={op} value={op}>{op}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-400 mb-1">Value</label>
              <input
                className="input-field"
                value={config.condition?.value || ''}
                onChange={e => update('condition', { ...config.condition, value: e.target.value })}
                placeholder="HIGH"
              />
            </div>
          </div>
          <p className="text-xs text-gray-500">
            💡 Add <code className="text-indigo-400">run_if: "true"</code> or <code className="text-indigo-400">run_if: "false"</code> to later steps to control branching.
          </p>
        </div>
      );

    case 'approval_gate':
      return (
        <div>
          <label className="block text-xs text-gray-400 mb-1">Description</label>
          <input
            className="input-field"
            value={config.description || ''}
            onChange={e => update('description', e.target.value)}
            placeholder="Approve to continue"
          />
        </div>
      );

    case 'db_write':
      return (
        <div>
          <label className="block text-xs text-gray-400 mb-1">
            Result field <span className="text-amber-400/70">(owner only step)</span>
          </label>
          <input
            className="input-field"
            value={config.result_field || 'previous_output'}
            onChange={e => update('result_field', e.target.value)}
          />
          <p className="text-xs text-gray-500 mt-1">Saves to <code className="text-amber-400">risk_assessments</code> table.</p>
        </div>
      );

    case 'notify':
      return (
        <div>
          <label className="block text-xs text-gray-400 mb-1">
            Message <span className="text-violet-400/70">(owner only step)</span>
          </label>
          <input
            className="input-field"
            value={config.message || ''}
            onChange={e => update('message', e.target.value)}
            placeholder="Workflow notification message"
          />
        </div>
      );

    default:
      return null;
  }
}

// ─── Sortable Step Card ──────────────────────────────────────

interface StepDraft {
  id: string;
  step_type: string;
  config: Record<string, any>;
  run_if?: string;
}

function SortableStep({
  step,
  index,
  onRemove,
  onUpdate,
  userRole,
}: {
  step: StepDraft;
  index: number;
  onRemove: () => void;
  onUpdate: (s: StepDraft) => void;
  userRole: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const typeInfo = STEP_TYPES.find(t => t.value === step.step_type);
  const Icon = typeInfo?.icon || Brain;
  const colorClass = typeInfo?.color || 'text-gray-400';

  return (
    <div ref={setNodeRef} style={style} className={`glass-card ${isDragging ? 'border-indigo-500/50' : ''}`}>
      <div className="flex items-center gap-3 p-4">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="text-gray-600 hover:text-gray-400 cursor-grab active:cursor-grabbing flex-shrink-0"
        >
          <GripVertical size={16} />
        </button>

        {/* Step number */}
        <span className="w-6 h-6 rounded-full bg-indigo-950/60 text-indigo-400 text-xs font-bold flex items-center justify-center flex-shrink-0">
          {index + 1}
        </span>

        {/* Icon + Type */}
        <div className={`flex items-center gap-2 flex-1 min-w-0 ${colorClass}`}>
          <Icon size={16} />
          <span className="text-sm font-medium text-gray-200">{typeInfo?.label || step.step_type}</span>
          {typeInfo?.ownerOnly && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
              owner only
            </span>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 text-gray-500 hover:text-gray-300 transition-colors"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button
            onClick={onRemove}
            className="p-1.5 text-gray-600 hover:text-rose-400 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-white/5">
          <div className="pt-3">
            {/* run_if option for conditional gating */}
            <div className="mb-3">
              <label className="block text-xs text-gray-500 mb-1">
                Run if branch result <span className="text-gray-600">(optional, for steps after conditional)</span>
              </label>
              <select
                className="input-field text-xs"
                value={step.run_if || ''}
                onChange={e => onUpdate({ ...step, run_if: e.target.value || undefined })}
              >
                <option value="">Always run</option>
                <option value="true">Only if condition = true</option>
                <option value="false">Only if condition = false</option>
              </select>
            </div>

            <StepConfigEditor
              stepType={step.step_type}
              config={step.config}
              onChange={config => onUpdate({ ...step, config })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Trigger Configurator ────────────────────────────────────

function TriggerConfig({
  triggers,
  onChange,
  userRole,
}: {
  triggers: Array<{ type: string; config: Record<string, any> }>;
  onChange: (t: Array<{ type: string; config: Record<string, any> }>) => void;
  userRole: string;
}) {
  const addTrigger = (type: string) => {
    if (triggers.find(t => t.type === type)) return; // no duplicates
    onChange([...triggers, { type, config: type === 'scheduled' ? { cron: '*/5 * * * *' } : {} }]);
  };
  const removeTrigger = (type: string) => onChange(triggers.filter(t => t.type !== type));
  const updateTriggerConfig = (type: string, config: Record<string, any>) => {
    onChange(triggers.map(t => t.type === type ? { ...t, config } : t));
  };

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Triggers</h4>

      {/* Active triggers */}
      {triggers.map(t => {
        const info = TRIGGER_TYPES.find(tt => tt.value === t.type);
        const Icon = info?.icon || MousePointer;
        return (
          <div key={t.type} className="glass-card p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Icon size={14} className="text-indigo-400" />
                <span className="text-sm text-gray-200">{info?.label || t.type}</span>
                {info?.ownerOnly && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    owner only
                  </span>
                )}
              </div>
              <button onClick={() => removeTrigger(t.type)} className="text-gray-600 hover:text-rose-400">
                <Trash2 size={13} />
              </button>
            </div>
            {t.type === 'scheduled' && (
              <input
                className="input-field text-xs font-mono"
                value={t.config.cron || '*/5 * * * *'}
                onChange={e => updateTriggerConfig(t.type, { cron: e.target.value })}
                placeholder="*/5 * * * *"
              />
            )}
            {t.type === 'webhook' && (
              <p className="text-xs text-gray-500">A unique webhook token will be generated after saving.</p>
            )}
          </div>
        );
      })}

      {/* Add trigger buttons */}
      <div className="flex flex-wrap gap-2">
        {TRIGGER_TYPES.map(({ value, label, icon: Icon, ownerOnly }) => {
          const active = triggers.find(t => t.type === value);
          const disabled = ownerOnly && userRole !== 'owner';
          return (
            <button
              key={value}
              onClick={() => !disabled && !active && addTrigger(value)}
              disabled={!!disabled || !!active}
              title={disabled ? 'Owner only' : active ? 'Already added' : `Add ${label} trigger`}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
                ${active ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300' :
                  disabled ? 'opacity-30 cursor-not-allowed border-gray-800 text-gray-600' :
                  'btn-secondary text-xs'}`}
            >
              <Icon size={12} />
              {label}
              {ownerOnly && !active && <Lock size={10} className="text-amber-400/60" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main WorkflowBuilder ────────────────────────────────────

export interface WorkflowBuilderProps {
  initialSteps?: StepDraft[];
  initialTriggers?: Array<{ type: string; config: Record<string, any> }>;
  userRole: string;
  onSave: (steps: StepDraft[], triggers: Array<{ type: string; config: Record<string, any> }>) => Promise<void>;
  saving?: boolean;
}

export function WorkflowBuilder({
  initialSteps = [],
  initialTriggers = [{ type: 'manual', config: {} }],
  userRole,
  onSave,
  saving = false,
}: WorkflowBuilderProps) {
  const [steps, setSteps] = useState<StepDraft[]>(initialSteps);
  const [triggers, setTriggers] = useState(initialTriggers);
  const [showStepPicker, setShowStepPicker] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIndex = steps.findIndex(s => s.id === active.id);
      const newIndex = steps.findIndex(s => s.id === over?.id);
      setSteps(arrayMove(steps, oldIndex, newIndex));
    }
  };

  const addStep = (type: string) => {
    setSteps(prev => [
      ...prev,
      {
        id: `step-${Date.now()}`,
        step_type: type,
        config: getDefaultConfig(type),
      },
    ]);
    setShowStepPicker(false);
  };

  const removeStep = (id: string) => setSteps(prev => prev.filter(s => s.id !== id));
  const updateStep = (id: string, updated: StepDraft) =>
    setSteps(prev => prev.map(s => s.id === id ? updated : s));

  const handleSave = () => {
    const stepsWithOrder = steps.map((s, i) => ({ ...s, step_order: i }));
    onSave(stepsWithOrder, triggers);
  };

  return (
    <div className="space-y-4">
      {/* Steps Builder */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Steps</h4>
          <span className="text-xs text-gray-600">{steps.length} step{steps.length !== 1 ? 's' : ''}</span>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={steps.map(s => s.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {steps.map((step, i) => (
                <React.Fragment key={step.id}>
                  <SortableStep
                    step={step}
                    index={i}
                    onRemove={() => removeStep(step.id)}
                    onUpdate={(updated) => updateStep(step.id, updated)}
                    userRole={userRole}
                  />
                  {i < steps.length - 1 && <div className="step-connector" />}
                </React.Fragment>
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {/* Add Step */}
        <div className="mt-3">
          {showStepPicker ? (
            <div className="glass-card p-4">
              <p className="text-xs text-gray-400 mb-3">Choose step type:</p>
              <div className="grid grid-cols-2 gap-2">
                {STEP_TYPES.map(({ value, label, icon: Icon, color, ownerOnly }) => {
                  const disabled = ownerOnly && userRole !== 'owner';
                  return (
                    <button
                      key={value}
                      onClick={() => !disabled && addStep(value)}
                      disabled={disabled}
                      className={`flex items-center gap-2 p-3 rounded-xl border text-sm font-medium transition-all text-left
                        ${disabled
                          ? 'opacity-30 cursor-not-allowed border-gray-800 text-gray-600'
                          : 'border-white/10 hover:border-indigo-500/40 hover:bg-indigo-950/30'}`}
                    >
                      <Icon size={15} className={color} />
                      <span className="text-gray-200">{label}</span>
                      {ownerOnly && <Lock size={10} className="text-amber-400/60 ml-auto" />}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setShowStepPicker(false)}
                className="mt-2 w-full text-center text-xs text-gray-500 hover:text-gray-300 py-1"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowStepPicker(true)}
              className="btn-secondary w-full justify-center text-sm"
            >
              <Plus size={16} />
              Add Step
            </button>
          )}
        </div>
      </div>

      {/* Triggers */}
      <div className="border-t border-white/5 pt-4">
        <TriggerConfig triggers={triggers} onChange={setTriggers} userRole={userRole} />
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving || steps.length === 0}
        className="btn-primary w-full justify-center"
      >
        {saving ? <><div className="spinner w-4 h-4" /> Saving…</> : 'Save Workflow'}
      </button>
    </div>
  );
}
