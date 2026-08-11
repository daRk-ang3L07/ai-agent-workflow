// functions/lib/step-executors.ts
// Individual step type execution logic with retry

import { adminQuery, gql } from './graphql';

const LLM_API_KEY = process.env.LLM_API_KEY || '';
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'groq'; // groq | openrouter | gemini
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

// ─────────────────────────────────────────────────────────────
// RETRY UTILITY
// ─────────────────────────────────────────────────────────────

const TRANSIENT_HTTP_CODES = new Set([408, 429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  maxRetries: number = MAX_RETRIES
): Promise<{ result: T; attempts: number }> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn(attempt);
      return { result, attempts: attempt };
    } catch (err: any) {
      lastError = err;
      const isTransient =
        err.status && TRANSIENT_HTTP_CODES.has(err.status) ||
        err.message?.includes('fetch failed') ||
        err.message?.includes('ECONNRESET') ||
        err.message?.includes('network');

      if (!isTransient || attempt === maxRetries) {
        throw err;
      }
      // Exponential backoff
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
    }
  }
  throw lastError;
}

// ─────────────────────────────────────────────────────────────
// TEMPLATE SUBSTITUTION
// Replaces {{input}}, {{previous_output}}, etc.
// ─────────────────────────────────────────────────────────────

export function substituteTemplate(template: string, context: Record<string, any>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = context[key];
    if (val === undefined) return `{{${key}}}`;
    return typeof val === 'string' ? val : JSON.stringify(val);
  });
}

// ─────────────────────────────────────────────────────────────
// LLM CALL
// ─────────────────────────────────────────────────────────────

export async function executeLLMCall(
  config: {
    prompt: string;
    system_prompt?: string;
    model?: string;
  },
  context: Record<string, any>
): Promise<{ output: string; attempts: number }> {
  const prompt = substituteTemplate(config.prompt, context);
  const systemPrompt = config.system_prompt || 'You are a helpful AI assistant.';

  const { result, attempts } = await withRetry(async (attempt) => {
    if (!LLM_API_KEY) {
      // Stubbed response for demo without API key
      console.log(`[LLM STUB] attempt ${attempt}, prompt: ${prompt.slice(0, 100)}`);
      await new Promise(r => setTimeout(r, 800)); // disclosed artificial delay
      const stubOutput = prompt.toLowerCase().includes('risk')
        ? 'Classification: HIGH risk. Reason: Elevated transaction velocity detected.'
        : 'Analysis complete. Result: LOW risk. No anomalies detected.';
      return stubOutput;
    }

    let endpoint: string;
    let headers: Record<string, string>;
    let body: any;

    if (LLM_PROVIDER === 'groq') {
      endpoint = 'https://api.groq.com/openai/v1/chat/completions';
      headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LLM_API_KEY}`,
      };
      body = {
        model: config.model || GROQ_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        max_tokens: 500,
        temperature: 0.7,
      };
    } else if (LLM_PROVIDER === 'openrouter') {
      endpoint = 'https://openrouter.ai/api/v1/chat/completions';
      headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LLM_API_KEY}`,
        'HTTP-Referer': process.env.APP_URL || 'https://localhost:3000',
      };
      body = {
        model: config.model || 'openai/gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
      };
    } else {
      throw new Error(`Unknown LLM provider: ${LLM_PROVIDER}`);
    }

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err: any = new Error(`LLM API error: ${resp.status}`);
      err.status = resp.status;
      throw err;
    }

    const json = await resp.json() as any;
    return json.choices?.[0]?.message?.content || '';
  });

  return { output: result, attempts };
}

// ─────────────────────────────────────────────────────────────
// HTTP REQUEST
// ─────────────────────────────────────────────────────────────

export async function executeHTTPRequest(
  config: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: any;
  },
  context: Record<string, any>
): Promise<{ output: any; attempts: number }> {
  const url = substituteTemplate(config.url, context);

  const { result, attempts } = await withRetry(async (attempt) => {
    console.log(`[HTTP] attempt ${attempt}: ${config.method} ${url}`);
    const resp = await fetch(url, {
      method: config.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...config.headers,
      },
      body: config.body && config.method !== 'GET'
        ? JSON.stringify(config.body)
        : undefined,
    });

    const text = await resp.text();
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { text };
    }

    if (!resp.ok) {
      const err: any = new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
      err.status = resp.status;
      throw err;
    }

    return { status: resp.status, body: parsed };
  });

  return { output: result, attempts };
}

// ─────────────────────────────────────────────────────────────
// DB WRITE — saves to risk_assessments (allowlisted table only)
// ─────────────────────────────────────────────────────────────

export async function executeDBWrite(
  config: {
    result_field?: string;
  },
  context: Record<string, any>
): Promise<{ output: any }> {
  const result =
    config.result_field
      ? context[config.result_field] ?? context.previous_output
      : context.previous_output;

  const data = await adminQuery<{
    insert_risk_assessments_one: { id: string };
  }>(
    gql`
      mutation InsertRiskAssessment(
        $orgId: uuid!
        $workflowRunId: uuid!
        $stepRunId: uuid!
        $result: String!
        $metadata: jsonb
      ) {
        insert_risk_assessments_one(
          object: {
            org_id: $orgId
            workflow_run_id: $workflowRunId
            step_run_id: $stepRunId
            result: $result
            metadata: $metadata
          }
        ) {
          id
        }
      }
    `,
    {
      orgId: context.org_id,
      workflowRunId: context.workflow_run_id,
      stepRunId: context.step_run_id,
      result: typeof result === 'string' ? result : JSON.stringify(result),
      metadata: { context },
    }
  );

  return {
    output: {
      saved: true,
      record_id: data.insert_risk_assessments_one.id,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// CONDITIONAL BRANCH
// Evaluates condition, sets branch_result in context
// ─────────────────────────────────────────────────────────────

export function evaluateConditionalBranch(
  config: {
    condition: {
      field: string;
      operator: 'contains' | 'equals' | 'starts_with' | 'ends_with' | 'not_contains';
      value: string;
    };
  },
  context: Record<string, any>
): { output: any; branchResult: 'true' | 'false' } {
  const { field, operator, value } = config.condition;
  const fieldValue = String(context[field] ?? context.previous_output ?? '').toLowerCase();
  const compareValue = value.toLowerCase();

  let conditionMet: boolean;
  switch (operator) {
    case 'contains':
      conditionMet = fieldValue.includes(compareValue);
      break;
    case 'equals':
      conditionMet = fieldValue === compareValue;
      break;
    case 'starts_with':
      conditionMet = fieldValue.startsWith(compareValue);
      break;
    case 'ends_with':
      conditionMet = fieldValue.endsWith(compareValue);
      break;
    case 'not_contains':
      conditionMet = !fieldValue.includes(compareValue);
      break;
    default:
      conditionMet = false;
  }

  const branchResult: 'true' | 'false' = conditionMet ? 'true' : 'false';
  return {
    output: {
      condition_met: conditionMet,
      branch: branchResult,
      evaluated_field: field,
      field_value: fieldValue,
      condition_value: compareValue,
    },
    branchResult,
  };
}

// ─────────────────────────────────────────────────────────────
// SHOULD STEP RUN (conditional_branch run_if check)
// ─────────────────────────────────────────────────────────────

export function shouldStepRun(
  stepConfig: Record<string, any>,
  context: Record<string, any>
): boolean {
  if (!stepConfig.run_if) return true; // no condition = always run
  const branchResult = context.branch_result;
  if (!branchResult) return true; // no branch result yet = run
  return stepConfig.run_if === branchResult;
}
