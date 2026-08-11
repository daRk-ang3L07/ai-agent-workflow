

async function run() {
  const subdomain = 'hthdfihfecprluniowpi';
  const region = 'eu-central-1';
  const adminSecret = 'asdfghkl;';
  
  const authUrl = `https://${subdomain}.auth.${region}.nhost.run/v1`;
  const graphqlUrl = `https://${subdomain}.hasura.${region}.nhost.run/v2/query`;

  console.log('1. Creating demo accounts via Auth API...');
  const usersToCreate = ['ownerA@test.com', 'ownerB@test.com'];
  
  for (const email of usersToCreate) {
    const res = await fetch(`${authUrl}/signup/email-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'password123' })
    });
    const data = await res.json();
    if (res.ok) {
      console.log(`Created ${email}`);
    } else {
      console.log(`Note: ${email} might already exist (${data.message || 'Error'})`);
    }
  }

  console.log('2. Verifying emails, setting roles, and mapping to organizations...');
  const sql = `
    -- Verify emails
    UPDATE auth.users SET email_verified = true WHERE email IN ('ownerA@test.com', 'ownerB@test.com');
    UPDATE auth.users SET default_role = 'viewer' WHERE email IN ('ownerA@test.com', 'ownerB@test.com');

    -- Insert roles
    INSERT INTO auth.roles (role) VALUES ('owner'), ('editor'), ('viewer') ON CONFLICT DO NOTHING;
    INSERT INTO auth.user_roles (user_id, role) SELECT id, 'owner' FROM auth.users WHERE email IN ('ownerA@test.com', 'ownerB@test.com') ON CONFLICT DO NOTHING;
    INSERT INTO auth.user_roles (user_id, role) SELECT id, 'viewer' FROM auth.users WHERE email IN ('ownerA@test.com', 'ownerB@test.com') ON CONFLICT DO NOTHING;

    -- Insert Orgs
    INSERT INTO public.organizations (id, name, slug, quota_calls_allowed) VALUES 
      ('aaaa0000-0000-0000-0000-000000000001', 'Org A — Risk Team', 'org-a', 50),
      ('bbbb0000-0000-0000-0000-000000000001', 'Org B — Analytics', 'org-b', 50) 
    ON CONFLICT DO NOTHING;

    -- Map Owner A
    INSERT INTO public.org_members (org_id, user_id, role)
    SELECT 'aaaa0000-0000-0000-0000-000000000001', id, 'owner'
    FROM auth.users WHERE email = 'ownerA@test.com'
    ON CONFLICT DO NOTHING;

    -- Map Owner B
    INSERT INTO public.org_members (org_id, user_id, role)
    SELECT 'bbbb0000-0000-0000-0000-000000000001', id, 'owner'
    FROM auth.users WHERE email = 'ownerB@test.com'
    ON CONFLICT DO NOTHING;
  `;

  const sqlRes = await fetch(graphqlUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': adminSecret
    },
    body: JSON.stringify({
      type: 'run_sql',
      args: { sql, cascade: false }
    })
  });
  
  const sqlJson = await sqlRes.json();
  if (sqlJson.error) {
    console.error('SQL Error:', sqlJson.error, sqlJson.internal);
  } else {
    console.log('Database seeded perfectly!');
  }
}

run().catch(console.error);
