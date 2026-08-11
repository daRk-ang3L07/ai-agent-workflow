// functions/lib/graphql.ts
// Shared Hasura admin GraphQL client for server-side function use

const HASURA_ENDPOINT = process.env.HASURA_GRAPHQL_ENDPOINT!;
const ADMIN_SECRET   = process.env.HASURA_ADMIN_SECRET!;

export async function adminQuery<T = any>(
  query: string,
  variables: Record<string, any> = {}
): Promise<T> {
  const response = await fetch(HASURA_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': ADMIN_SECRET,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Hasura HTTP error ${response.status}: ${text}`);
  }

  const json = (await response.json()) as { data?: T; errors?: any[] };
  if (json.errors?.length) {
    throw new Error(`Hasura GraphQL error: ${JSON.stringify(json.errors)}`);
  }
  return json.data as T;
}

// Convenience wrappers
export const gql = String.raw;
