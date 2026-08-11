'use client';
// frontend/src/lib/apollo.ts
// Apollo Client with WebSocket support for live subscriptions

import { ApolloClient, InMemoryCache, split, HttpLink, from } from '@apollo/client';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { createClient } from 'graphql-ws';
import { getMainDefinition } from '@apollo/client/utilities';
import { setContext } from '@apollo/client/link/context';
import { nhost } from './nhost';

const HASURA_URL = process.env.NEXT_PUBLIC_HASURA_URL || 'https://placeholder.hasura.nhost.run';
const HASURA_WS_URL = HASURA_URL.replace('https://', 'wss://').replace('http://', 'ws://');

// Add auth headers to every request
const authLink = setContext(async (_, { headers }) => {
  const session = nhost.auth.getSession();
  const token = session?.accessToken;
  let userRole = 'user';
  if (typeof window !== 'undefined') {
    userRole = window.localStorage.getItem('currentRole') || 'user';
  }

  return {
    headers: {
      ...headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'x-hasura-role': userRole,
    },
  };
});

const httpLink = new HttpLink({ uri: `${HASURA_URL}/v1/graphql` });

// WebSocket link for subscriptions — only in browser
const wsLink = typeof window !== 'undefined'
  ? new GraphQLWsLink(
      createClient({
        url: `${HASURA_WS_URL}/v1/graphql`,
        connectionParams: () => {
          const session = nhost.auth.getSession();
          const token = session?.accessToken;
          let userRole = 'user';
          if (typeof window !== 'undefined') {
            userRole = window.localStorage.getItem('currentRole') || 'user';
          }
          return {
            headers: {
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
              'x-hasura-role': userRole,
            },
          };
        },
      })
    )
  : null;

// Split: subscriptions go to WebSocket, queries/mutations to HTTP
const splitLink = wsLink
  ? split(
      ({ query }) => {
        const def = getMainDefinition(query);
        return def.kind === 'OperationDefinition' && def.operation === 'subscription';
      },
      wsLink,
      from([authLink, httpLink])
    )
  : from([authLink, httpLink]);

export const apolloClient = new ApolloClient({
  link: splitLink,
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: { fetchPolicy: 'network-only' },
    query: { fetchPolicy: 'network-only' },
  },
});

export default apolloClient;
