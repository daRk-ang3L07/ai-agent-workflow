// functions/webhook-trigger.ts
// Inbound webhook endpoint — validates token, starts workflow run
// No auth header needed — security via unique webhook_token

import type { Request, Response } from 'express';
import { adminQuery, gql } from './lib/graphql';
import { reserveQuota, releaseQuota } from './lib/quota';
import { executeRun, createStepRuns } from './lib/execute-run';

export default async function handler(req: Request, res: Response) {
  try {
    // ── Parse input — can come from Hasura Action body or direct POST
    const body = req.body?.input ?? req.body;
    const workflowId: string = body?.workflow_id;
    const token: string = body?.token;
    const payload: any = body?.payload || {};

    if (!workflowId || !token) {
      return res.status(400).json({
        success: false,
        message: 'Missing workflow_id or token',
      });
    }

    // ── Validate webhook token against workflow_triggers table
    const triggerData = await adminQuery<{
      workflow_triggers: Array<{
        id: string;
        workflow_id: string;
        trigger_type: string;
        workflow: {
          id: string;
          org_id: string;
          is_active: boolean;
        };
      }>;
    }>(
      gql`
        query ValidateWebhookToken($workflowId: uuid!, $token: String!) {
          workflow_triggers(
            where: {
              workflow_id: { _eq: $workflowId }
              trigger_type: { _eq: webhook }
              webhook_token: { _eq: $token }
            }
          ) {
            id
            workflow_id
            trigger_type
            workflow {
              id
              org_id
              is_active
            }
          }
        }
      `,
      { workflowId, token }
    );

    const trigger = triggerData.workflow_triggers[0];
    if (!trigger) {
      return res.status(401).json({
        success: false,
        message: 'Invalid workflow_id or token',
      });
    }

    if (!trigger.workflow.is_active) {
      return res.status(400).json({
        success: false,
        message: 'Workflow is not active',
      });
    }

    const orgId = trigger.workflow.org_id;

    // ── Reserve quota
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
        mutation CreateWebhookRun($workflowId: uuid!) {
          insert_workflow_runs_one(
            object: {
              workflow_id: $workflowId
              trigger_type: webhook
              status: pending
            }
          ) {
            id
          }
        }
      `,
      { workflowId }
    );

    const workflowRunId = runData.insert_workflow_runs_one.id;

    // ── Create step_runs
    try {
      await createStepRuns(workflowRunId, workflowId);
    } catch (err: any) {
      await releaseQuota(orgId);
      return res.status(500).json({ success: false, message: err.message });
    }

    // ── Respond immediately, then execute
    res.status(200).json({
      success: true,
      workflow_run_id: workflowRunId,
      message: 'Webhook received — workflow run started',
    });

    // Execute after response is sent
    setImmediate(async () => {
      try {
        await executeRun({ workflowRunId, orgId, startingStepOrder: 0 });
      } catch (err: any) {
        console.error('[webhook-trigger] Execution error:', err.message);
        await releaseQuota(orgId);
      }
    });

  } catch (err: any) {
    console.error('[webhook-trigger] Error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Internal server error',
    });
  }
}
