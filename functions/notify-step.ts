// functions/notify-step.ts
// Hasura Event Trigger handler — fires when a step_run status changes
// Sends Slack notification for steps with step_type = 'notify'

import type { Request, Response } from 'express';
import { adminQuery, gql } from './lib/graphql';

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || '';

export default async function handler(req: Request, res: Response) {
  try {
    // Hasura Event Trigger sends event in this format
    const event = req.body;
    const { new: newRow, old: oldRow } = event.event?.data || {};

    // Only process step_runs that belong to 'notify' step type
    // and just transitioned to 'running'
    if (!newRow || newRow.status !== 'running') {
      return res.status(200).json({ message: 'Not a notify event, skipping' });
    }

    // Load the step type for this step_run
    const data = await adminQuery<{
      step_runs_by_pk: {
        id: string;
        workflow_run_id: string;
        workflow_step: {
          step_type: string;
          config: {
            message?: string;
            channel?: string;
          };
        };
        workflow_run: {
          workflow: {
            name: string;
            org_id: string;
          };
        };
      };
    }>(
      gql`
        query GetStepRunForNotify($id: uuid!) {
          step_runs_by_pk(id: $id) {
            id
            workflow_run_id
            workflow_step {
              step_type
              config
            }
            workflow_run {
              workflow {
                name
                org_id
              }
            }
          }
        }
      `,
      { id: newRow.id }
    );

    const stepRun = data.step_runs_by_pk;
    if (!stepRun || stepRun.workflow_step.step_type !== 'notify') {
      return res.status(200).json({ message: 'Not a notify step, skipping' });
    }

    const { config } = stepRun.workflow_step;
    const workflowName = stepRun.workflow_run.workflow.name;
    const message = config.message || `Workflow "${workflowName}" reached a notify step.`;

    // ── Send Slack notification (or log if no webhook configured)
    if (SLACK_WEBHOOK_URL) {
      await fetch(SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `🔔 *Agent Workflow Notification*\n*Workflow:* ${workflowName}\n*Message:* ${message}`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `🔔 *Agent Workflow Notification*\n*Workflow:* ${workflowName}\n\n${message}`,
              },
            },
          ],
        }),
      });
    } else {
      console.log(`[notify-step] NOTIFICATION (no Slack configured): ${message}`);
    }

    // ── Mark step as completed
    await adminQuery(
      gql`
        mutation CompleteNotifyStep($id: uuid!) {
          update_step_runs_by_pk(
            pk_columns: { id: $id }
            _set: {
              status: completed
              completed_at: "now()"
              output: { notified: true, message: "Notification sent" }
            }
          ) {
            id
          }
        }
      `,
      { id: newRow.id }
    );

    return res.status(200).json({ success: true, message: 'Notification sent' });

  } catch (err: any) {
    console.error('[notify-step] Error:', err);
    // Return 200 to prevent Hasura retrying with the same result
    return res.status(200).json({ error: err.message });
  }
}
