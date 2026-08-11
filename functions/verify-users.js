const fs = require('fs');

async function run() {
  const adminSecret = 'asdfghkl;';
  const url = 'https://hthdfihfecprluniowpi.hasura.eu-central-1.nhost.run/v2/query';

  console.log('Verifying all users...');
  const sqlRes = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': adminSecret
    },
    body: JSON.stringify({
      type: 'run_sql',
      args: { sql: 'UPDATE auth.users SET email_verified = true;', cascade: false }
    })
  });
  
  const sqlJson = await sqlRes.json();
  if (sqlJson.error) {
    console.error('SQL Error:', sqlJson.error, sqlJson.internal);
  } else {
    console.log('Users Verified Successfully!');
  }
}

run().catch(console.error);
