

async function run() {
  const adminSecret = 'asdfghkl;';
  const url = 'https://hthdfihfecprluniowpi.hasura.eu-central-1.nhost.run/v1/metadata';

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': adminSecret
    },
    body: JSON.stringify({
      type: 'export_metadata',
      args: {}
    })
  });
  
  const json = await res.json();
  const fs = require('fs');
  fs.writeFileSync('current_metadata.json', JSON.stringify(json, null, 2));
  console.log('Exported current metadata');
}

run().catch(console.error);
