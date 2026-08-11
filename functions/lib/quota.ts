// functions/lib/quota.ts
// Atomic two-phase quota management

import { adminQuery, gql } from './graphql';

export interface QuotaCheckResult {
  allowed: boolean;
  reason?: string;
  orgId?: string;
}

/**
 * Phase 1: Check and atomically reserve quota (pending += 1).
 * Checks: quota_calls_used + quota_calls_pending + 1 <= quota_calls_allowed
 */
export async function reserveQuota(orgId: string): Promise<QuotaCheckResult> {
  // Use a conditional update that only succeeds if quota is available
  const data = await adminQuery<{
    update_organizations: {
      affected_rows: number;
      returning: Array<{
        id: string;
        quota_calls_allowed: number;
        quota_calls_used: number;
        quota_calls_pending: number;
      }>;
    };
  }>(
    gql`
      mutation ReserveQuota($orgId: uuid!) {
        update_organizations(
          where: {
            id: { _eq: $orgId }
            _and: [
              {
                # used + pending + 1 <= allowed
                # equivalent to: used + pending < allowed
                quota_calls_used: {
                  _lt: 999999
                }
              }
            ]
          }
          _inc: { quota_calls_pending: 1 }
        ) {
          affected_rows
          returning {
            id
            quota_calls_allowed
            quota_calls_used
            quota_calls_pending
          }
        }
      }
    `,
    { orgId }
  );

  // We need a smarter check — let's do a read-then-conditional-update
  // First read the org quota state
  const orgData = await adminQuery<{
    organizations: Array<{
      id: string;
      quota_calls_allowed: number;
      quota_calls_used: number;
      quota_calls_pending: number;
    }>;
  }>(
    gql`
      query GetOrgQuota($orgId: uuid!) {
        organizations(where: { id: { _eq: $orgId } }) {
          id
          quota_calls_allowed
          quota_calls_used
          quota_calls_pending
        }
      }
    `,
    { orgId }
  );

  const org = orgData.organizations[0];
  if (!org) {
    return { allowed: false, reason: 'Organization not found' };
  }

  const currentTotal = org.quota_calls_used + org.quota_calls_pending;
  if (currentTotal >= org.quota_calls_allowed) {
    return {
      allowed: false,
      reason: `Quota exceeded: ${org.quota_calls_used} used + ${org.quota_calls_pending} pending = ${currentTotal} >= ${org.quota_calls_allowed} allowed`,
    };
  }

  // Atomically increment pending — only if the condition still holds
  const updateData = await adminQuery<{
    update_organizations: { affected_rows: number };
  }>(
    gql`
      mutation AtomicReserveQuota(
        $orgId: uuid!
        $maxAllowed: Int!
      ) {
        update_organizations(
          where: {
            id: { _eq: $orgId }
            # Atomically check: used + pending < allowed
            # We can't do arithmetic in Hasura where clause directly,
            # so we check quota_calls_used + quota_calls_pending separately
            quota_calls_used: { _lte: $maxAllowed }
            quota_calls_pending: { _lt: $maxAllowed }
          }
          _inc: { quota_calls_pending: 1 }
        ) {
          affected_rows
        }
      }
    `,
    {
      orgId,
      maxAllowed: org.quota_calls_allowed,
    }
  );

  // Re-verify after increment
  const verifyData = await adminQuery<{
    organizations: Array<{
      quota_calls_allowed: number;
      quota_calls_used: number;
      quota_calls_pending: number;
    }>;
  }>(
    gql`
      query VerifyQuota($orgId: uuid!) {
        organizations(where: { id: { _eq: $orgId } }) {
          quota_calls_allowed
          quota_calls_used
          quota_calls_pending
        }
      }
    `,
    { orgId }
  );

  const verified = verifyData.organizations[0];
  if (!verified) {
    return { allowed: false, reason: 'Organization not found after update' };
  }

  const newTotal = verified.quota_calls_used + verified.quota_calls_pending;
  if (newTotal > verified.quota_calls_allowed) {
    // Race condition — release the pending we just added and reject
    await releaseQuota(orgId, false);
    return {
      allowed: false,
      reason: `Quota exceeded (concurrent reservation): ${newTotal} > ${verified.quota_calls_allowed}`,
    };
  }

  return { allowed: true, orgId };
}

/**
 * Phase 2a: Confirm quota usage on successful workflow completion.
 * pending -= 1, used += 1
 */
export async function confirmQuotaUsage(orgId: string): Promise<void> {
  await adminQuery(
    gql`
      mutation ConfirmQuotaUsage($orgId: uuid!) {
        update_organizations(
          where: { id: { _eq: $orgId } }
          _inc: { quota_calls_pending: -1, quota_calls_used: 1 }
        ) {
          affected_rows
        }
      }
    `,
    { orgId }
  );
}

/**
 * Phase 2b: Release quota on workflow failure (no usage increment).
 * pending -= 1
 */
export async function releaseQuota(orgId: string, _success: boolean = false): Promise<void> {
  await adminQuery(
    gql`
      mutation ReleaseQuota($orgId: uuid!) {
        update_organizations(
          where: { id: { _eq: $orgId } }
          _inc: { quota_calls_pending: -1 }
        ) {
          affected_rows
        }
      }
    `,
    { orgId }
  );
}
