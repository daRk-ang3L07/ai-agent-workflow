// functions/approve-step.ts
// Hasura Action handler: approveStep(step_run_id)
// Layer 2b: verifies approver is owner/editor in the workflow's org
// This is an explicit code check, NOT a database permission,
// because approval is a mid-execution decision across multiple tables.

import type { Request, Response } from 'express';
import { adminQuery, gql } from './lib/graphql';
import { getCallerRoleForStepRun, canApprove } from './lib/authorization';
import { executeRun } from './lib/execute-run';

export default async function handler(req: Request, res: Response) {
  try {
    const { input, session_variables } = req.body;
    const stepRunId: string = input?.step_run_id;
    const userId: string = session_variables?.['x-hasura-user-id'];

    if (!stepRunId || !userId) {
      return res.status(400).json({ success: false, message: 'Missing step_run_id or user session' });
    }

    // ── Layer 2b: Verify approver is owner/editor in the workflow's org
    const info = await getCallerRoleForStepRun(userId, stepRunId);

    if (!info) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: step not found or not in your organization',
      });
    }

    if (!canApprove(info.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied: role "${info.role}" cannot approve workflow steps`,
      });
    }

    // ── Verify the step_run is actually in paused state
    if (info.stepRun.status !== 'paused') {
      return res.status(400).json({
        success: false,
        message: `Step is not awaiting approval (status: ${info.stepRun.status})`,
      });
    }

    if (info.stepRun.workflow_run.status !== 'paused') {
      return res.status(400).json({
        success: false,
        message: `Workflow run is not paused (status: ${info.stepRun.workflow_run.status})`,
      });
    }

    // ── Record approval
    await adminQuery(
      gql`
        mutation ApproveStepRun(
          $stepRunId: uuid!
          $approvedBy: uuid!
          $approvedAt: timestamptz!
        ) {
          update_step_runs_by_pk(
            pk_columns: { id: $stepRunId }
            _set: {
              status: completed
              approved_by: $approvedBy
              approved_at: $approvedAt
              completed_at: $approvedAt
            }
          ) {
            id
          }
        }
      `,
      {
        stepRunId,
        approvedBy: userId,
        approvedAt: new Date().toISOString(),
      }
    );

    // ── Set workflow_run back to running
    await adminQuery(
      gql`
        mutation ResumeWorkflowRun($runId: uuid!) {
          update_workflow_runs_by_pk(
            pk_columns: { id: $runId }
            _set: { status: running }
          ) {
            id
          }
        }
      `,
      { runId: info.workflowRunId }
    );

    // ── Load the workflow's org_id for quota tracking
    const workflowData = await adminQuery<{
      workflow_runs_by_pk: {
        workflow: { org_id: string };
      };
    }>(
      gql`
        query GetRunOrgId($runId: uuid!) {
          workflow_runs_by_pk(id: $runId) {
            workflow { org_id }
          }
        }
      `,
      { runId: info.workflowRunId }
    );

    const orgId = workflowData.workflow_runs_by_pk?.workflow?.org_id || info.orgId;

    // ── Resume execution from the NEXT step (never restart from step 1)
    setImmediate(async () => {
      try {
        await executeRun({
          workflowRunId: info.workflowRunId,
          orgId,
          startingStepOrder: info.nextStepOrder,
        });
      } catch (err: any) {
        console.error('[approve-step] Resume execution error:', err.message);
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Step approved — workflow resuming',
    });

  } catch (err: any) {
    console.error('[approve-step] Error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Internal server error',
    });
  }
}
