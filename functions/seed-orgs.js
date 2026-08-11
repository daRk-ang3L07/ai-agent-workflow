const fs = require('fs');

async function run() {
  const adminSecret = 'asdfghkl;';
  const url = 'https://hthdfihfecprluniowpi.hasura.eu-central-1.nhost.run/v2/query';

  console.log('Fetching users and inserting into Org A and Org B...');
  const sqlRes = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': adminSecret
    },
    body: JSON.stringify({
      type: 'run_sql',
      args: { sql: `
        -- Insert Orgs
        INSERT INTO public.organizations (id, name, slug, quota_calls_allowed) VALUES 
          ('aaaa0000-0000-0000-0000-000000000001', 'Org A — Risk Team', 'org-a', 50),
          ('bbbb0000-0000-0000-0000-000000000001', 'Org B — Analytics', 'org-b', 50) 
        ON CONFLICT DO NOTHING;

        -- We assume the user created ownerA@test.com
        INSERT INTO public.org_members (org_id, user_id, role)
        SELECT 'aaaa0000-0000-0000-0000-000000000001', id, 'owner'
        FROM auth.users
        WHERE email = 'ownerA@test.com'
        ON CONFLICT DO NOTHING;
      `, cascade: false }
    })
  });
  
  const sqlJson = await sqlRes.json();
  if (sqlJson.error) {
    console.error('SQL Error:', sqlJson.error, sqlJson.internal);
  } else {
    console.log('Seed SQL executed successfully!');
  }
}

run().catch(console.error);
