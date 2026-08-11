const fs = require('fs');

async function run() {
  const adminSecret = 'asdfghkl;';
  const url = 'https://hthdfihfecprluniowpi.hasura.eu-central-1.nhost.run/v2/query';

  console.log('Inserting roles into auth.roles and auth.user_roles...');
  const sqlRes = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': adminSecret
    },
    body: JSON.stringify({
      type: 'run_sql',
      args: { sql: `
        INSERT INTO auth.roles (role) VALUES ('owner'), ('editor'), ('viewer') ON CONFLICT DO NOTHING;
        INSERT INTO auth.user_roles (user_id, role) SELECT id, 'owner' FROM auth.users ON CONFLICT DO NOTHING;
        INSERT INTO auth.user_roles (user_id, role) SELECT id, 'editor' FROM auth.users ON CONFLICT DO NOTHING;
        INSERT INTO auth.user_roles (user_id, role) SELECT id, 'viewer' FROM auth.users ON CONFLICT DO NOTHING;
        UPDATE auth.users SET default_role = 'viewer';
      `, cascade: false }
    })
  });
  
  const sqlJson = await sqlRes.json();
  if (sqlJson.error) {
    console.error('SQL Error:', sqlJson.error, sqlJson.internal);
  } else {
    console.log('Roles Inserted Successfully!');
  }
}

run().catch(console.error);
