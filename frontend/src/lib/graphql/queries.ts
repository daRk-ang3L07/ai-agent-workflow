// frontend/src/lib/graphql/queries.ts
// All GraphQL operations: queries, mutations, subscriptions

import { gql } from '@apollo/client';

// ─────────────────────────────────────────────────────────────
// QUERIES
// ─────────────────────────────────────────────────────────────

export const GET_MY_ORGS = gql`
  query GetMyOrgs {
    org_members {
      id
      role
      organization {
        id
        name
        slug
        quota_calls_allowed
        quota_calls_used
        quota_calls_pending
      }
    }
  }
`;

export const GET_WORKFLOWS = gql`
  query GetWorkflows($orgId: uuid!) {
    workflows(
      where: { org_id: { _eq: $orgId } }
      order_by: { created_at: desc }
    ) {
      id
      name
      description
      is_active
      created_at
      updated_at
      workflow_steps(order_by: { step_order: asc }) {
        id
        step_order
        step_type
        config
      }
      workflow_triggers {
        id
        trigger_type
        config
        webhook_token
      }
      workflow_runs(order_by: { created_at: desc }, limit: 1) {
        id
        status
        trigger_type
        created_at
        completed_at
      }
    }
  }
`;

export const GET_WORKFLOW_DETAIL = gql`
  query GetWorkflowDetail($id: uuid!) {
    workflows_by_pk(id: $id) {
      id
      name
      description
      is_active
      org_id
      created_at
      updated_at
      workflow_steps(order_by: { step_order: asc }) {
        id
        step_order
        step_type
        config
      }
      workflow_triggers {
        id
        trigger_type
        config
        webhook_token
      }
      workflow_runs(order_by: { created_at: desc }, limit: 5) {
        id
        status
        trigger_type
        created_at
        started_at
        completed_at
      }
    }
  }
`;

export const GET_WORKFLOW_RUN = gql`
  query GetWorkflowRun($runId: uuid!) {
    workflow_runs_by_pk(id: $runId) {
      id
      status
      trigger_type
      created_at
      started_at
      completed_at
      workflow {
        id
        name
        org_id
      }
      step_runs(order_by: { step_order: asc }) {
        id
        step_order
        status
        input
        output
        error
        attempt_count
        approved_by
        approved_at
        started_at
        completed_at
        workflow_step {
          step_type
          config
        }
      }
    }
  }
`;

export const GET_ORG_USAGE = gql`
  query GetOrgUsage($orgId: uuid!) {
    org_usage_this_month(where: { org_id: { _eq: $orgId } }) {
      org_id
      org_name
      quota_calls_allowed
      quota_calls_used
      quota_calls_pending
      runs_this_month
      avg_run_duration_seconds
    }
  }
`;

// ─────────────────────────────────────────────────────────────
// MUTATIONS
// ─────────────────────────────────────────────────────────────

export const CREATE_WORKFLOW = gql`
  mutation CreateWorkflow($orgId: uuid!, $name: String!, $description: String) {
    insert_workflows_one(
      object: { org_id: $orgId, name: $name, description: $description }
    ) {
      id
      name
    }
  }
`;

export const UPDATE_WORKFLOW = gql`
  mutation UpdateWorkflow($id: uuid!, $name: String!, $description: String, $isActive: Boolean) {
    update_workflows_by_pk(
      pk_columns: { id: $id }
      _set: { name: $name, description: $description, is_active: $isActive, updated_at: "now()" }
    ) {
      id
      name
    }
  }
`;

export const DELETE_WORKFLOW = gql`
  mutation DeleteWorkflow($id: uuid!) {
    delete_workflows_by_pk(id: $id) { id }
  }
`;

export const UPSERT_WORKFLOW_STEPS = gql`
  mutation UpsertWorkflowSteps(
    $workflowId: uuid!
    $steps: [workflow_steps_insert_input!]!
  ) {
    delete_workflow_steps(where: { workflow_id: { _eq: $workflowId } }) {
      affected_rows
    }
    insert_workflow_steps(objects: $steps) {
      returning {
        id
        step_order
        step_type
        config
      }
    }
  }
`;

export const UPSERT_WORKFLOW_TRIGGERS = gql`
  mutation UpsertWorkflowTriggers(
    $workflowId: uuid!
    $triggers: [workflow_triggers_insert_input!]!
  ) {
    delete_workflow_triggers(where: { workflow_id: { _eq: $workflowId } }) {
      affected_rows
    }
    insert_workflow_triggers(objects: $triggers) {
      returning {
        id
        trigger_type
        config
        webhook_token
      }
    }
  }
`;

export const TRIGGER_WORKFLOW_RUN = gql`
  mutation TriggerWorkflowRun($workflowId: uuid!) {
    triggerWorkflowRun(workflow_id: $workflowId) {
      success
      workflow_run_id
      message
    }
  }
`;

export const APPROVE_STEP = gql`
  mutation ApproveStep($stepRunId: uuid!) {
    approveStep(step_run_id: $stepRunId) {
      success
      message
    }
  }
`;

// ─────────────────────────────────────────────────────────────
// SUBSCRIPTIONS
// ─────────────────────────────────────────────────────────────

export const STEP_RUNS_SUBSCRIPTION = gql`
  subscription OnStepRuns($workflowRunId: uuid!) {
    step_runs(
      where: { workflow_run_id: { _eq: $workflowRunId } }
      order_by: { step_order: asc }
    ) {
      id
      step_order
      status
      input
      output
      error
      attempt_count
      approved_by
      approved_at
      started_at
      completed_at
      workflow_step {
        step_type
        config
      }
    }
  }
`;

export const WORKFLOW_RUN_STATUS_SUBSCRIPTION = gql`
  subscription OnWorkflowRunStatus($workflowRunId: uuid!) {
    workflow_runs_by_pk(id: $workflowRunId) {
      id
      status
      started_at
      completed_at
    }
  }
`;
