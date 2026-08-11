// functions/lib/execute-run.ts
// THE CORE EXECUTOR — shared by all triggers (manual, webhook, scheduled, approval resume)
// Never duplicate this logic.

import { adminQuery, gql } from './graphql';
import {
  executeLLMCall,
  executeHTTPRequest,
  executeDBWrite,
  evaluateConditionalBranch,
  shouldStepRun,
} from './step-executors';
import { confirmQuotaUsage, releaseQuota } from './quota';

// ─────────────────────────────────────────────────────────────
// TYPE DEFINITIONS
// ─────────────────────────────────────────────────────────────

interface StepRun {
  id: string;
  step_order: number;
  status: string;
  workflow_step_id: string;
  workflow_step: {
    step_type: string;
    config: Record<string, any>;
  };
}

interface RunContext {
  workflowRunId: string;
  orgId: string;
  startingStepOrder: number;
}

// ─────────────────────────────────────────────────────────────
// STEP RUN STATUS HELPERS
// ─────────────────────────────────────────────────────────────

async function updateStepRun(
  stepRunId: string,
  patch: Record<string, any>
) {
  await adminQuery(
    gql`
      mutation UpdateStepRun($stepRunId: uuid!, $patch: step_runs_set_input!) {
        update_step_runs_by_pk(pk_columns: { id: $stepRunId }, _set: $patch) {
          id
        }
      }
    `,
    { stepRunId, patch }
  );
}

async function updateWorkflowRun(
  workflowRunId: string,
  patch: Record<string, any>
) {
  await adminQuery(
    gql`
      mutation UpdateWorkflowRun($workflowRunId: uuid!, $patch: workflow_runs_set_input!) {
        update_workflow_runs_by_pk(pk_columns: { id: $workflowRunId }, _set: $patch) {
          id
        }
      }
    `,
    { workflowRunId, patch }
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN EXECUTOR
// ─────────────────────────────────────────────────────────────

export async function executeRun({
  workflowRunId,
  orgId,
  startingStepOrder,
}: RunContext): Promise<void> {
  // Mark run as running
  await updateWorkflowRun(workflowRunId, {
    status: 'running',
    started_at: new Date().toISOString(),
  });

  // Load all step_runs for this run, ordered by step_order
  const data = await adminQuery<{
    step_runs: StepRun[];
  }>(
    gql`
      query GetStepRuns($workflowRunId: uuid!, $fromOrder: Int!) {
        step_runs(
          where: {
            workflow_run_id: { _eq: $workflowRunId }
            step_order: { _gte: $fromOrder }
          }
          order_by: { step_order: asc }
        ) {
          id
          step_order
          status
          workflow_step_id
          workflow_step {
            step_type
            config
          }
        }
      }
    `,
    { workflowRunId, fromOrder: startingStepOrder }
  );

  const stepRuns = data.step_runs;

  // Execution context — carries outputs between steps
  let executionContext: Record<string, any> = {
    workflow_run_id: workflowRunId,
    org_id: orgId,
    previous_output: null,
    branch_result: null,
  };

  let overallSuccess = true;

  for (const stepRun of stepRuns) {
    const { id: stepRunId, step_order, workflow_step } = stepRun;
    const { step_type, config } = workflow_step;

    // ── Skip already-completed or skipped steps (resuming after approval)
    if (stepRun.status === 'completed' || stepRun.status === 'skipped') {
      continue;
    }

    // ── Check conditional branch gate (run_if)
    if (!shouldStepRun(config, executionContext)) {
      await updateStepRun(stepRunId, {
        status: 'skipped',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        output: { skipped_reason: `run_if="${config.run_if}" not met (branch="${executionContext.branch_result}")` },
      });
      continue;
    }

    // ── Mark step as running
    await updateStepRun(stepRunId, {
      status: 'running',
      started_at: new Date().toISOString(),
      input: { context: executionContext },
    });

    // ── APPROVAL GATE: pause here
    if (step_type === 'approval_gate') {
      await updateStepRun(stepRunId, {
        status: 'paused',
      });
      await updateWorkflowRun(workflowRunId, { status: 'paused' });
      // Do NOT continue — return without completing, subscription shows paused state
      return;
    }

    // ── Execute the step
    try {
      let stepOutput: any;
      let attemptCount = 1;

      executionContext.step_run_id = stepRunId;

      switch (step_type) {
        case 'llm_call': {
          const r = await executeLLMCall(config as any, executionContext);
          stepOutput = r.output;
          attemptCount = r.attempts;
          break;
        }
        case 'http_request': {
          const r = await executeHTTPRequest(config as any, executionContext);
          stepOutput = r.output;
          attemptCount = r.attempts;
          break;
        }
        case 'db_write': {
          const r = await executeDBWrite(config as any, executionContext);
          stepOutput = r.output;
          break;
        }
        case 'notify': {
          // Notify is handled via Hasura Event Trigger on step_run status change.
          // We set status to running (event trigger fires notify-step function),
          // then mark completed immediately — the event trigger handles the actual notification async.
          stepOutput = { notified: true, note: 'Notification dispatched via event trigger' };
          break;
        }
        case 'conditional_branch': {
          const r = evaluateConditionalBranch(config as any, executionContext);
          stepOutput = r.output;
          executionContext.branch_result = r.branchResult;
          break;
        }
        default:
          throw new Error(`Unknown step type: ${step_type}`);
      }

      // ── Update step as completed
      await updateStepRun(stepRunId, {
        status: 'completed',
        output: typeof stepOutput === 'string' ? { text: stepOutput } : stepOutput,
        attempt_count: attemptCount,
        completed_at: new Date().toISOString(),
      });

      // Update execution context for next step
      executionContext.previous_output =
        typeof stepOutput === 'string' ? stepOutput : JSON.stringify(stepOutput);
      executionContext[`step_${step_order}_output`] = executionContext.previous_output;
      executionContext.output = executionContext.previous_output;

    } catch (err: any) {
      console.error(`[executeRun] Step ${step_type} failed:`, err.message);

      // Load attempt count from DB
      const attemptData = await adminQuery<{
        step_runs_by_pk: { attempt_count: number };
      }>(
        gql`
          query GetAttemptCount($id: uuid!) {
            step_runs_by_pk(id: $id) { attempt_count }
          }
        `,
        { id: stepRunId }
      );
      const attempts = (attemptData.step_runs_by_pk?.attempt_count ?? 0) + 1;

      await updateStepRun(stepRunId, {
        status: 'failed',
        error: err.message,
        attempt_count: attempts,
        completed_at: new Date().toISOString(),
      });

      // Fail the whole run
      await updateWorkflowRun(workflowRunId, {
        status: 'failed',
        completed_at: new Date().toISOString(),
      });

      // Release quota (pending -= 1, used stays same)
      await releaseQuota(orgId);
      overallSuccess = false;
      return;
    }
  }

  // ── All steps completed
  if (overallSuccess) {
    await updateWorkflowRun(workflowRunId, {
      status: 'completed',
      completed_at: new Date().toISOString(),
    });
    // Confirm quota usage: pending -= 1, used += 1
    await confirmQuotaUsage(orgId);
  }
}

// ─────────────────────────────────────────────────────────────
// CREATE STEP RUNS for a new workflow run
// ─────────────────────────────────────────────────────────────

export async function createStepRuns(
  workflowRunId: string,
  workflowId: string
): Promise<void> {
  // Load workflow steps
  const data = await adminQuery<{
    workflow_steps: Array<{
      id: string;
      step_order: number;
    }>;
  }>(
    gql`
      query GetWorkflowSteps($workflowId: uuid!) {
        workflow_steps(
          where: { workflow_id: { _eq: $workflowId } }
          order_by: { step_order: asc }
        ) {
          id
          step_order
        }
      }
    `,
    { workflowId }
  );

  const steps = data.workflow_steps;
  if (!steps.length) {
    throw new Error('Workflow has no steps');
  }

  // Insert step_runs for each step
  await adminQuery(
    gql`
      mutation CreateStepRuns($objects: [step_runs_insert_input!]!) {
        insert_step_runs(objects: $objects) {
          affected_rows
        }
      }
    `,
    {
      objects: steps.map(s => ({
        workflow_run_id: workflowRunId,
        workflow_step_id: s.id,
        step_order: s.step_order,
        status: 'pending',
      })),
    }
  );
}
