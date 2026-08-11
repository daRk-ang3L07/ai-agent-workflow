// functions/scheduled-trigger.ts
// Hasura Cron Trigger handler — fires every minute
// Checks for scheduled workflow_triggers with matching cron expression
// Uses the same executeRun() as all other triggers

import type { Request, Response } from 'express';
import { adminQuery, gql } from './lib/graphql';
import { reserveQuota, releaseQuota } from './lib/quota';
import { executeRun, createStepRuns } from './lib/execute-run';

// Simple cron matcher — checks if a cron expression matches current time
function matchesCron(cronExpr: string): boolean {
  try {
    const now = new Date();
    const parts = cronExpr.trim().split(/\s+/);
    if (parts.length !== 5) return false;

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    const matchField = (field: string, value: number): boolean => {
      if (field === '*') return true;
      if (field.includes('/')) {
        const [, step] = field.split('/');
        return value % parseInt(step) === 0;
      }
      if (field.includes(',')) {
        return field.split(',').some(v => parseInt(v) === value);
      }
      if (field.includes('-')) {
        const [start, end] = field.split('-').map(Number);
        return value >= start && value <= end;
      }
      return parseInt(field) === value;
    };

    return (
      matchField(minute, now.getUTCMinutes()) &&
      matchField(hour, now.getUTCHours()) &&
      matchField(dayOfMonth, now.getUTCDate()) &&
      matchField(month, now.getUTCMonth() + 1) &&
      matchField(dayOfWeek, now.getUTCDay())
    );
  } catch {
    return false;
  }
}

export default async function handler(req: Request, res: Response) {
  // Optional: verify cron secret to prevent unauthorized calls
  const cronSecret = req.headers['x-hasura-cron-secret'];
  if (process.env.HASURA_EVENT_SECRET && cronSecret !== process.env.HASURA_EVENT_SECRET) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    // ── Load all active scheduled triggers
    const data = await adminQuery<{
      workflow_triggers: Array<{
        id: string;
        workflow_id: string;
        config: { cron?: string };
        workflow: {
          id: string;
          org_id: string;
          is_active: boolean;
        };
      }>;
    }>(
      gql`
        query GetScheduledTriggers {
          workflow_triggers(
            where: {
              trigger_type: { _eq: scheduled }
              workflow: { is_active: { _eq: true } }
            }
          ) {
            id
            workflow_id
            config
            workflow {
              id
              org_id
              is_active
            }
          }
        }
      `
    );

    const triggers = data.workflow_triggers;
    const started: string[] = [];
    const skipped: string[] = [];

    for (const trigger of triggers) {
      const cron = trigger.config?.cron;
      if (!cron || !matchesCron(cron)) {
        skipped.push(trigger.workflow_id);
        continue;
      }

      const orgId = trigger.workflow.org_id;
      const workflowId = trigger.workflow_id;

      // Reserve quota
      const quota = await reserveQuota(orgId);
      if (!quota.allowed) {
        console.log(`[scheduled-trigger] Quota exceeded for org ${orgId}, skipping workflow ${workflowId}`);
        skipped.push(workflowId);
        continue;
      }

      // Create workflow_run
      const runData = await adminQuery<{
        insert_workflow_runs_one: { id: string };
      }>(
        gql`
          mutation CreateScheduledRun($workflowId: uuid!) {
            insert_workflow_runs_one(
              object: {
                workflow_id: $workflowId
                trigger_type: scheduled
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

      try {
        await createStepRuns(workflowRunId, workflowId);
      } catch (err: any) {
        await releaseQuota(orgId);
        console.error(`[scheduled-trigger] Failed to create step runs for ${workflowId}:`, err.message);
        continue;
      }

      // Execute async
      setImmediate(async () => {
        try {
          await executeRun({ workflowRunId, orgId, startingStepOrder: 0 });
        } catch (err: any) {
          console.error('[scheduled-trigger] Execution error:', err.message);
          await releaseQuota(orgId);
        }
      });

      started.push(workflowRunId);
    }

    return res.status(200).json({
      processed: triggers.length,
      started: started.length,
      skipped: skipped.length,
      run_ids: started,
    });

  } catch (err: any) {
    console.error('[scheduled-trigger] Error:', err);
    return res.status(500).json({ message: err.message });
  }
}
