// functions/trigger-workflow-run.ts
// Hasura Action handler: triggerWorkflowRun(workflow_id)
// Layer 1: verifies org membership + role
// Phase 1 quota: atomic reserve
// Creates workflow_run + step_runs, then executes

import type { Request, Response } from 'express';
import { adminQuery, gql } from './lib/graphql';
import { getCallerRoleForWorkflow, canTrigger } from './lib/authorization';
import { reserveQuota, releaseQuota } from './lib/quota';
import { executeRun, createStepRuns } from './lib/execute-run';

export default async function handler(req: Request, res: Response) {
  try {
    // ── Extract session variables from Hasura Action payload
    const { input, session_variables } = req.body;
    const workflowId: string = input?.workflow_id;
    const userId: string = session_variables?.['x-hasura-user-id'];

    if (!workflowId || !userId) {
      return res.status(400).json({ message: 'Missing workflow_id or user session' });
    }

    // ── Layer 1: Verify caller is owner/editor in this workflow's org
    const memberInfo = await getCallerRoleForWorkflow(userId, workflowId);
    if (!memberInfo) {
      return res.status(403).json({ message: 'Access denied: not a member of this organization' });
    }
    if (!canTrigger(memberInfo.role)) {
      return res.status(403).json({
        message: `Access denied: role "${memberInfo.role}" cannot trigger workflows`,
      });
    }

    const { orgId } = memberInfo;

    // ── Check + reserve quota (atomic two-phase)
    const quotaResult = await reserveQuota(orgId);
    if (!quotaResult.allowed) {
      return res.status(429).json({
        success: false,
        message: quotaResult.reason || 'Quota exceeded',
      });
    }

    // ── Create workflow_run
    const runData = await adminQuery<{
      insert_workflow_runs_one: { id: string };
    }>(
      gql`
        mutation CreateWorkflowRun(
          $workflowId: uuid!
          $triggeredBy: uuid!
          $triggerType: String!
        ) {
          insert_workflow_runs_one(
            object: {
              workflow_id: $workflowId
              triggered_by: $triggeredBy
              trigger_type: $triggerType
              status: pending
            }
          ) {
            id
          }
        }
      `,
      {
        workflowId,
        triggeredBy: userId,
        triggerType: 'manual',
      }
    );

    const workflowRunId = runData.insert_workflow_runs_one.id;

    // ── Create step_runs (one per step, all pending)
    try {
      await createStepRuns(workflowRunId, workflowId);
    } catch (err: any) {
      // Rollback quota reservation if step creation fails
      await releaseQuota(orgId);
      await adminQuery(
        gql`
          mutation FailWorkflowRun($id: uuid!) {
            update_workflow_runs_by_pk(
              pk_columns: { id: $id }
              _set: { status: failed, completed_at: "now()" }
            ) { id }
          }
        `,
        { id: workflowRunId }
      );
      return res.status(500).json({
        success: false,
        message: `Failed to create step runs: ${err.message}`,
      });
    }

    // ── Execute the run (this handles all step logic, quota confirmation, etc.)
    try {
      await executeRun({ workflowRunId, orgId, startingStepOrder: 0 });
    } catch (err: any) {
      console.error('[trigger-workflow-run] Execution error:', err.message);
      await releaseQuota(orgId);
      await adminQuery(
        gql`
          mutation FailRun($id: uuid!) {
            update_workflow_runs_by_pk(
              pk_columns: { id: $id }
              _set: { status: failed, completed_at: "now()" }
            ) { id }
          }
        `,
        { id: workflowRunId }
      );
    }

    return res.status(200).json({
      success: true,
      workflow_run_id: workflowRunId,
      message: 'Workflow run started',
    });

  } catch (err: any) {
    console.error('[trigger-workflow-run] Error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Internal server error',
    });
  }
}
