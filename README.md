# FlowAgent — AI Agent Workflow Builder

A production-grade, mini n8n-style AI workflow engine built on **nhost + Hasura + PostgreSQL + GraphQL + Next.js**.

🚀 **Live Demo**: [https://flow-agent.vercel.app](https://flow-agent.vercel.app)  
📦 **GitHub**: [github.com/your-username/agent-workflow-builder](https://github.com)

---

## Architecture

```
Next.js (Vercel)  →  Hasura GraphQL Engine  →  nhost Functions  →  PostgreSQL
                           ↑                         ↑
                    Row-Level RBAC              Business Logic
                    (Layer 1: org scoping)      (Layer 2: step gating)
```

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), Apollo Client, dnd-kit |
| API | Hasura GraphQL Engine (via nhost) |
| Auth | nhost Auth (JWT) |
| Database | PostgreSQL 16 (nhost-managed) |
| Functions | nhost Serverless Functions (TypeScript) |
| LLM | Groq (`llama-3.1-8b-instant`) or stubbed |
| Deployment | Vercel (frontend) + nhost Cloud (backend) |

---

## Local Setup

### Prerequisites
- Docker Desktop installed and running
- Node.js 20+
- nhost account at https://app.nhost.io
- Groq API key at https://console.groq.com (free tier)

### 1. Clone and install

```bash
git clone https://github.com/your-username/agent-workflow-builder.git
cd agent-workflow-builder

# Install frontend deps
cd frontend && npm install && cd ..

# Install functions deps
cd functions && npm install && cd ..
```

### 2. Create nhost project

1. Go to https://app.nhost.io → New Project
2. Note your **subdomain** and **region**
3. Get your **Hasura admin secret** from Settings > Secrets
4. Connect your GitHub repo for auto-deployment

### 3. Configure environment variables

**Frontend** (`frontend/.env.local`):
```env
NEXT_PUBLIC_NHOST_SUBDOMAIN=your-subdomain
NEXT_PUBLIC_NHOST_REGION=eu-central-1
NEXT_PUBLIC_HASURA_URL=https://your-subdomain.hasura.eu-central-1.nhost.run
NEXT_PUBLIC_FUNCTIONS_URL=https://your-subdomain.functions.eu-central-1.nhost.run
```

**Functions** — set in nhost Dashboard → Settings → Environment Variables:
```env
LLM_API_KEY=gsk_...your-groq-key
LLM_PROVIDER=groq
GROQ_MODEL=llama-3.1-8b-instant
HASURA_EVENT_SECRET=your-random-secret
SLACK_WEBHOOK_URL=  (optional)
```

> ⚠️ `HASURA_ADMIN_SECRET` and `LLM_API_KEY` are **never** exposed to the frontend. They live only in nhost environment variables.

### 4. Apply database migrations

In the Hasura Console (your project → Hasura → Open Console):
1. Go to **Data** → SQL
2. Paste and run `nhost/migrations/1_init_schema.sql`

### 5. Configure Hasura

In Hasura Console:
1. **Track all tables**: Data → your-schema → Track All
2. **Import metadata**: Settings → Import Metadata → paste `nhost/metadata/tables.yaml`
3. **Actions**: Actions tab → import `triggerWorkflowRun`, `approveStep`, `webhookTriggerRun`
4. **Event Triggers**: Events → `on_notify_step_run_status`, `on_watched_event_insert`
5. **Cron Trigger**: Events → Cron → `scheduled_workflow_runner` (every minute `* * * * *`)

### 6. Create demo organizations

Run in Hasura Console SQL:
```sql
-- Org A
INSERT INTO organizations (id, name, slug, quota_calls_allowed)
VALUES ('aaaa0000-0000-0000-0000-000000000001', 'Org A — Risk Team', 'org-a', 50);

-- Org B
INSERT INTO organizations (id, name, slug, quota_calls_allowed)
VALUES ('bbbb0000-0000-0000-0000-000000000001', 'Org B — Analytics', 'org-b', 50);
```

Then sign up users in the UI and insert org_members:
```sql
INSERT INTO org_members (org_id, user_id, role) VALUES
  ('aaaa0000-...', 'user-uuid-owner-a', 'owner'),
  ('aaaa0000-...', 'user-uuid-editor-a', 'editor'),
  ('bbbb0000-...', 'user-uuid-owner-b', 'owner');
```

### 7. Run locally

```bash
cd frontend && npm run dev
# Visit http://localhost:3000
```

---

## GraphQL Operations

### Query: Org workflows with steps, triggers, latest run
```graphql
query GetWorkflows($orgId: uuid!) {
  workflows(where: { org_id: { _eq: $orgId } }) {
    id name description
    workflow_steps(order_by: { step_order: asc }) { step_type config }
    workflow_triggers { trigger_type config webhook_token }
    workflow_runs(order_by: { created_at: desc }, limit: 1) { id status }
  }
}
```

### Mutation: Trigger a run
```graphql
mutation TriggerWorkflowRun($workflowId: uuid!) {
  triggerWorkflowRun(workflow_id: $workflowId) {
    success workflow_run_id message
  }
}
```

### Mutation: Approve a paused step
```graphql
mutation ApproveStep($stepRunId: uuid!) {
  approveStep(step_run_id: $stepRunId) {
    success message
  }
}
```

### Subscription: Live step run updates
```graphql
subscription OnStepRuns($workflowRunId: uuid!) {
  step_runs(where: { workflow_run_id: { _eq: $workflowRunId } }, order_by: { step_order: asc }) {
    id status input output error attempt_count approved_by approved_at
    workflow_step { step_type config }
  }
}
```

---

## Webhook Usage

```bash
curl -X POST https://your-subdomain.functions.region.nhost.run/webhook-trigger \
  -H 'Content-Type: application/json' \
  -d '{
    "workflow_id": "your-workflow-uuid",
    "token": "your-webhook-token",
    "payload": {"customer_id": "cust_123"}
  }'
```

The webhook token is auto-generated when you add a webhook trigger and is shown in the workflow detail page.

---

## Roles & Permissions

| Action | Owner | Editor | Viewer |
|---|---|---|---|
| View workflows/runs | ✓ | ✓ | ✓ |
| Create/edit workflows | ✓ | ✓ | ✗ |
| Add `llm_call`, `http_request`, `conditional_branch`, `approval_gate` steps | ✓ | ✓ | ✗ |
| Add `db_write`, `notify` steps | ✓ | **✗** | ✗ |
| Add `webhook`, `scheduled` triggers | ✓ | **✗** | ✗ |
| Trigger manual runs | ✓ | ✓ | ✗ |
| Approve `approval_gate` steps | ✓ | ✓ | ✗ |
| Manage org members | ✓ | ✗ | ✗ |

---

## Approval Architecture

When the executor reaches an `approval_gate` step:
1. Sets `step_run.status = 'paused'`
2. Sets `workflow_run.status = 'paused'`
3. **Returns immediately** — does not hold the function open

The frontend subscription shows ⏸ immediately. An owner/editor sees an Approve button.

When approved via `approveStep`:
1. Layer 2b check in Action handler: verifies the approver's role in the workflow's org
2. Records `approved_by`, `approved_at`, marks step `completed`
3. Sets `workflow_run.status = 'running'`
4. Resumes execution from **the next step** (never restarts from step 1)

---

## Quota Architecture

| Event | pending | used |
|---|---|---|
| Run starts | +1 | unchanged |
| Run completes successfully | -1 | +1 |
| Run fails | -1 | unchanged |

Concurrent protection: `pending += 1` only happens after checking `used + pending < allowed`. A race condition is detected by verifying the totals after the increment.

---

## Retry Behavior

LLM Call and HTTP Request steps retry on transient errors:
- HTTP 429 (rate limit)
- HTTP 5xx (server error)  
- Network failures (ECONNRESET, fetch failed)

**Max 3 attempts** with exponential backoff (1s, 2s). Permanent errors fail immediately. `step_runs.attempt_count` reflects the actual number of attempts made.

---

## Deployment

### Backend (nhost Cloud)
The backend deploys automatically via GitHub integration:
1. Connect your GitHub repo to your nhost project
2. Push changes → nhost automatically deploys migrations, metadata, and functions

### Frontend (Vercel)
```bash
cd frontend
vercel --prod
# Set environment variables in Vercel dashboard
```

---

## Known Limitations

- **db_event trigger**: Schema is fully in place (`watched_events` table, Event Trigger, handler function). In the demo, it can be tested by inserting directly into `watched_events`. Full UI for configuring watched tables is not implemented.
- **LLM stub**: If no `LLM_API_KEY` is set, the LLM step returns a hardcoded response with an 800ms disclosed artificial delay.
- **Member management UI**: Member invite/management is done via Hasura Console SQL in the demo setup (the API enforces owner-only access).
