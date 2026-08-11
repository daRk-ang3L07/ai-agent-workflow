// functions/db-event-trigger.ts
// Hasura Event Trigger handler — fires when a new watched_events row is inserted
// Starts a workflow run for any workflow with trigger_type = db_event in that org

import type { Request, Response } from 'express';
import { adminQuery, gql } from './lib/graphql';
import { reserveQuota, releaseQuota } from './lib/quota';
import { executeRun, createStepRuns } from './lib/execute-run';

export default async function handler(req: Request, res: Response) {
  try {
    const event = req.body;
    const newRow = event.event?.data?.new;

    if (!newRow) {
      return res.status(200).json({ message: 'No new row data' });
    }

    const orgId: string = newRow.org_id;

    // ── Find active db_event workflows for this org
    const data = await adminQuery<{
      workflow_triggers: Array<{
        workflow_id: string;
        workflow: {
          id: string;
          org_id: string;
          is_active: boolean;
        };
      }>;
    }>(
      gql`
        query GetDbEventTriggers($orgId: uuid!) {
          workflow_triggers(
            where: {
              trigger_type: { _eq: db_event }
              workflow: {
                org_id: { _eq: $orgId }
                is_active: { _eq: true }
              }
            }
          ) {
            workflow_id
            workflow {
              id
              org_id
              is_active
            }
          }
        }
      `,
      { orgId }
    );

    const triggers = data.workflow_triggers;
    if (!triggers.length) {
      return res.status(200).json({ message: 'No db_event workflows for this org' });
    }

    // Mark the watched_event as processed
    await adminQuery(
      gql`
        mutation MarkProcessed($id: uuid!) {
          update_watched_events_by_pk(
            pk_columns: { id: $id }
            _set: { processed: true }
          ) { id }
        }
      `,
      { id: newRow.id }
    );

    for (const trigger of triggers) {
      const workflowId = trigger.workflow_id;

      const quota = await reserveQuota(orgId);
      if (!quota.allowed) {
        console.log(`[db-event-trigger] Quota exceeded for org ${orgId}`);
        continue;
      }

      const runData = await adminQuery<{
        insert_workflow_runs_one: { id: string };
      }>(
        gql`
          mutation CreateDbEventRun($workflowId: uuid!) {
            insert_workflow_runs_one(
              object: {
                workflow_id: $workflowId
                trigger_type: db_event
                status: pending
              }
            ) { id }
          }
        `,
        { workflowId }
      );

      const workflowRunId = runData.insert_workflow_runs_one.id;
      await createStepRuns(workflowRunId, workflowId);

      setImmediate(async () => {
        try {
          await executeRun({ workflowRunId, orgId, startingStepOrder: 0 });
        } catch (err: any) {
          console.error('[db-event-trigger] Execution error:', err.message);
          await releaseQuota(orgId);
        }
      });
    }

    return res.status(200).json({ success: true, started: triggers.length });

  } catch (err: any) {
    console.error('[db-event-trigger] Error:', err);
    return res.status(200).json({ error: err.message });
  }
}
