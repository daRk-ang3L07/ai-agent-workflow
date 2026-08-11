// frontend/src/lib/nhost.ts
// nhost client initialization — uses environment variables
// Using nhost-js v3 (React-compatible)

import { NhostClient } from '@nhost/nhost-js';

export const nhost = new NhostClient({
  subdomain: process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || 'placeholder',
  region: process.env.NEXT_PUBLIC_NHOST_REGION || 'eu-central-1',
});

export default nhost;
