-- ============================================================
-- AI Agent Workflow Builder — Database Migration
-- ============================================================

-- Enable pgcrypto for UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- ORGANIZATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.organizations (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text        NOT NULL,
  slug                 text        NOT NULL UNIQUE,
  quota_calls_allowed  integer     NOT NULL DEFAULT 100,
  quota_calls_used     integer     NOT NULL DEFAULT 0,
  quota_calls_pending  integer     NOT NULL DEFAULT 0,
  quota_reset_at       timestamptz NOT NULL DEFAULT (date_trunc('month', NOW()) + INTERVAL '1 month'),
  created_at           timestamptz NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ORG MEMBERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.org_members (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text        NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user_org ON public.org_members(user_id, org_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON public.org_members(org_id);

-- ============================================================
-- WORKFLOWS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.workflows (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  description text,
  is_active   boolean     NOT NULL DEFAULT true,
  created_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT NOW(),
  updated_at  timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflows_org ON public.workflows(org_id);

-- ============================================================
-- WORKFLOW STEPS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.workflow_steps (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid        NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  step_order  integer     NOT NULL,
  step_type   text        NOT NULL CHECK (step_type IN (
    'llm_call', 'http_request', 'db_write', 'notify',
    'conditional_branch', 'approval_gate'
  )),
  config      jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (workflow_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow ON public.workflow_steps(workflow_id, step_order);

-- ============================================================
-- WORKFLOW TRIGGERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.workflow_triggers (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id   uuid        NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  trigger_type  text        NOT NULL CHECK (trigger_type IN ('manual', 'webhook', 'scheduled', 'db_event')),
  config        jsonb       NOT NULL DEFAULT '{}',
  webhook_token text        UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at    timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_triggers_type ON public.workflow_triggers(trigger_type);
CREATE INDEX IF NOT EXISTS idx_workflow_triggers_workflow ON public.workflow_triggers(workflow_id);

-- ============================================================
-- WORKFLOW RUNS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.workflow_runs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id  uuid        NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  triggered_by uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  trigger_type text        NOT NULL DEFAULT 'manual',
  status       text        NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'running', 'paused', 'completed', 'failed'
  )),
  started_at   timestamptz,
  completed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_created ON public.workflow_runs(workflow_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON public.workflow_runs(status);

-- ============================================================
-- STEP RUNS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.step_runs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_run_id  uuid        NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
  workflow_step_id uuid        NOT NULL REFERENCES public.workflow_steps(id) ON DELETE CASCADE,
  step_order       integer     NOT NULL,
  status           text        NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'running', 'paused', 'completed', 'failed', 'skipped'
  )),
  input            jsonb,
  output           jsonb,
  error            text,
  attempt_count    integer     NOT NULL DEFAULT 0,
  approved_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at      timestamptz,
  started_at       timestamptz,
  completed_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_step_runs_run ON public.step_runs(workflow_run_id);
CREATE INDEX IF NOT EXISTS idx_step_runs_run_order ON public.step_runs(workflow_run_id, step_order);

-- ============================================================
-- RISK ASSESSMENTS (db_write target table)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.risk_assessments (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workflow_run_id uuid        NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
  step_run_id     uuid        REFERENCES public.step_runs(id) ON DELETE SET NULL,
  result          text        NOT NULL,
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risk_assessments_org ON public.risk_assessments(org_id);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_run ON public.risk_assessments(workflow_run_id);

-- ============================================================
-- ORG USAGE VIEW (aggregation / computed field)
-- ============================================================
CREATE OR REPLACE VIEW public.org_usage_this_month AS
SELECT
  o.id                                                           AS org_id,
  o.name                                                         AS org_name,
  o.quota_calls_allowed,
  o.quota_calls_used,
  o.quota_calls_pending,
  o.quota_reset_at,
  COUNT(wr.id) FILTER (
    WHERE wr.created_at >= date_trunc('month', NOW())
  )                                                              AS runs_this_month,
  AVG(
    EXTRACT(EPOCH FROM (wr.completed_at - wr.started_at))
  ) FILTER (WHERE wr.completed_at IS NOT NULL)                   AS avg_run_duration_seconds
FROM public.organizations o
LEFT JOIN public.workflows w ON w.org_id = o.id
LEFT JOIN public.workflow_runs wr ON wr.workflow_id = w.id
GROUP BY o.id;

-- ============================================================
-- WATCHED TABLE (for db_event trigger demo)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.watched_events (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type text        NOT NULL DEFAULT 'data_received',
  payload    jsonb,
  processed  boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_watched_events_org ON public.watched_events(org_id, processed);
