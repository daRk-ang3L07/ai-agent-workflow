# FlowAgent — Architecture & Design Write-Up

## Schema Design

The data model follows a strict ownership chain:

```
organizations
    └── org_members (user_id, role)
    └── workflows
            └── workflow_steps (step_type, config JSONB, step_order)
            └── workflow_triggers (trigger_type, webhook_token, cron config)
            └── workflow_runs (status: pending|running|paused|completed|failed)
                    └── step_runs (status, input, output, error, attempt_count,
                                   approved_by, approved_at)
```

**Key decisions:**

- **JSONB for config**: Each step type has wildly different configs (LLM prompts, HTTP URLs, conditions). A single `config JSONB` column avoids a complex inheritance schema while keeping the data queryable.
- **step_order denormalized into step_runs**: When a step_run is created, it copies the step_order. This ensures the execution order is locked at run-creation time, even if the workflow is later edited.
- **`quota_calls_pending` alongside `quota_calls_used`**: A simple `used` counter can be bypassed under concurrent load. The two-phase design (`pending += 1` at start, `pending -= 1, used += 1` at completion) allows safe concurrent quota enforcement without database-level locks.
- **`risk_assessments` as an allowlisted db_write target**: Rather than a general-purpose SQL engine (a security nightmare), `db_write` steps always write to this one known table using server-side credentials.
- **`org_usage_this_month` view**: A PostgreSQL view that joins organizations → workflows → workflow_runs, providing the aggregated quota + run statistics as a computed field accessible via Hasura.

---

## Two Permission Layers

### Layer 1 — Hasura Row-Level Permissions (Organization + Role Scoping)

**Mechanism**: Every Hasura SELECT/INSERT/UPDATE/DELETE permission is a boolean expression that traverses relationships to verify two things simultaneously: (1) the requesting user is a member of the organization, and (2) they have the required role.

**Example** — `workflow_steps` SELECT for the `editor` role:
```json
{
  "workflow": {
    "organization": {
      "org_members": {
        "_and": [
          { "user_id": { "_eq": "X-Hasura-User-Id" } },
          { "role": { "_in": ["owner", "editor"] } }
        ]
      }
    }
  }
}
```

This means Hasura generates a SQL JOIN through `workflow_steps → workflows → organizations → org_members` and filters to only rows where the requesting user has the right role in that org. **An editor in Org B who knows a valid Org A workflow_step ID will receive 0 rows** — not an error, just empty results, preventing information leakage about ID existence.

**Layer 2a** — Hasura INSERT permission checks for privileged step types:

The `editor` role's INSERT permission on `workflow_steps` includes an additional check:
```json
{
  "step_type": { "_in": ["llm_call", "http_request", "conditional_branch", "approval_gate"] }
}
```

This is a real database/API boundary, not just a hidden UI button. An editor POSTing a raw GraphQL mutation to add a `db_write` step will receive a Hasura permission error. The same applies to `webhook` and `scheduled` triggers — only owners can insert them.

### Layer 2b — Action Handler Code Checks (Mid-Execution Decisions)

**Why not a DB permission?** Approving an `approval_gate` step is not a simple row-level read/write. It requires: (1) loading the step_run, (2) verifying it belongs to a workflow in the caller's org, (3) checking the caller's role in that org, (4) setting approval fields, AND (5) resuming execution — all as a single atomic business logic operation. Database permissions can only enforce who can write a row; they cannot enforce the full approval workflow chain.

**Mechanism** in `approve-step.ts`:
```typescript
// 1. Load step_run → workflow_run → workflow → org → org_members
const info = await getCallerRoleForStepRun(userId, stepRunId);

// 2. Verify membership (Layer 1 equivalent, in code)
if (!info) return res.status(403).json({ message: 'Not in your organization' });

// 3. Verify role (Layer 2b — the actual gate)
if (!canApprove(info.role)) // only owner/editor
  return res.status(403).json({ message: `role "${info.role}" cannot approve` });

// 4. Only now: record approval + resume
```

The same pattern applies in `trigger-workflow-run.ts`: even though Hasura Actions list `owner` and `editor` as permitted roles, the handler **independently verifies** membership and role using the admin GraphQL API. This means a request with a forged JWT claiming `editor` role but no actual `org_members` entry will be rejected.

---

## Approval Gate — Pause/Resume Architecture

```
Executor reaches approval_gate step
        ↓
step_run.status = 'paused'
workflow_run.status = 'paused'
        ↓
executeRun() returns
Function exits (no long-poll, no open connection)
        ↓
GraphQL subscription immediately pushes update to frontend
Frontend renders ⏸ "Awaiting Approval"
        ↓
Owner/Editor clicks Approve
        ↓
approveStep Hasura Action fires
        ↓
Handler: verify membership + role (Layer 2b)
        ↓
step_run: approved_by=userId, approved_at=now(), status='completed'
workflow_run: status='running'
        ↓
executeRun(runId, startingStepOrder = approvalStepOrder + 1)
Execution resumes from NEXT step — never restarts from step 1
        ↓
Remaining steps execute, subscription updates live
        ↓
workflow_run.status = 'completed'
quota: pending -= 1, used += 1
```

**Key design choices:**
- The approval reservation keeps `quota_calls_pending += 1` during the entire paused period. This correctly prevents the org from running more workflows than their quota allows while a run is waiting for approval.
- `startingStepOrder` is passed to `executeRun()` as `approvalStepOrder + 1`. The executor skips any step with `status = 'completed'` or `status = 'skipped'`, so resumption is safe even if the function is called with a lower starting order.
