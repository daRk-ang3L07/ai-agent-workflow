// functions/lib/authorization.ts
// Layer 1 + Layer 2 authorization checks for Action handlers

import { adminQuery, gql } from './graphql';

export type OrgRole = 'owner' | 'editor' | 'viewer';

export interface MemberInfo {
  userId: string;
  orgId: string;
  role: OrgRole;
}

/**
 * Get the caller's role in the workflow's org.
 * Returns null if user is not a member.
 */
export async function getCallerRoleForWorkflow(
  userId: string,
  workflowId: string
): Promise<MemberInfo | null> {
  const data = await adminQuery<{
    workflows: Array<{
      id: string;
      org_id: string;
      organization: {
        org_members: Array<{ role: string; user_id: string }>;
      };
    }>;
  }>(
    gql`
      query GetWorkflowOrgMembership($workflowId: uuid!, $userId: uuid!) {
        workflows(where: { id: { _eq: $workflowId } }) {
          id
          org_id
          organization {
            org_members(where: { user_id: { _eq: $userId } }) {
              role
              user_id
            }
          }
        }
      }
    `,
    { workflowId, userId }
  );

  const workflow = data.workflows[0];
  if (!workflow) return null;

  const member = workflow.organization.org_members[0];
  if (!member) return null;

  return {
    userId,
    orgId: workflow.org_id,
    role: member.role as OrgRole,
  };
}

/**
 * Get the caller's role in the org that owns a given step_run.
 * Used in approveStep for Layer 2b check.
 */
export async function getCallerRoleForStepRun(
  userId: string,
  stepRunId: string
): Promise<(MemberInfo & { stepRun: any; workflowRunId: string; nextStepOrder: number }) | null> {
  const data = await adminQuery<{
    step_runs: Array<{
      id: string;
      step_order: number;
      status: string;
      workflow_run_id: string;
      workflow_run: {
        id: string;
        workflow_id: string;
        status: string;
        workflow: {
          org_id: string;
          organization: {
            org_members: Array<{ role: string }>;
          };
        };
      };
    }>;
  }>(
    gql`
      query GetStepRunMembership($stepRunId: uuid!, $userId: uuid!) {
        step_runs(where: { id: { _eq: $stepRunId } }) {
          id
          step_order
          status
          workflow_run_id
          workflow_run {
            id
            workflow_id
            status
            workflow {
              org_id
              organization {
                org_members(where: { user_id: { _eq: $userId } }) {
                  role
                }
              }
            }
          }
        }
      }
    `,
    { stepRunId, userId }
  );

  const stepRun = data.step_runs[0];
  if (!stepRun) return null;

  const member = stepRun.workflow_run.workflow.organization.org_members[0];
  if (!member) return null;

  return {
    userId,
    orgId: stepRun.workflow_run.workflow.org_id,
    role: member.role as OrgRole,
    stepRun,
    workflowRunId: stepRun.workflow_run_id,
    nextStepOrder: stepRun.step_order + 1,
  };
}

/**
 * Check if a role can trigger workflows (owner or editor)
 */
export function canTrigger(role: OrgRole): boolean {
  return role === 'owner' || role === 'editor';
}

/**
 * Check if a role can approve approval_gate steps (owner or editor)
 */
export function canApprove(role: OrgRole): boolean {
  return role === 'owner' || role === 'editor';
}
