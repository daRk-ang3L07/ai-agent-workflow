const fs = require('fs');

async function run() {
  const adminSecret = 'asdfghkl;';
  const url = 'https://hthdfihfecprluniowpi.hasura.eu-central-1.nhost.run/v2/query';
  const metadataUrl = 'https://hthdfihfecprluniowpi.hasura.eu-central-1.nhost.run/v1/metadata';

  // 1. Run SQL
  const sql = fs.readFileSync('../nhost/migrations/1_init_schema.sql', 'utf8');
  console.log('Running SQL Migration...');
  const sqlRes = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': adminSecret
    },
    body: JSON.stringify({
      type: 'run_sql',
      args: { sql, cascade: true }
    })
  });
  
  const sqlJson = await sqlRes.json();
  if (sqlJson.error) {
    console.error('SQL Error:', sqlJson.error, sqlJson.internal);
  } else {
    console.log('SQL Migration Success!');
  }

  // 2. We will apply metadata in the next step, let's just do SQL first.
}

run().catch(console.error);
