const fs = require('fs');
const yaml = require('js-yaml');

async function run() {
  const adminSecret = 'asdfghkl;';
  const url = 'https://hthdfihfecprluniowpi.hasura.eu-central-1.nhost.run/v1/metadata';

  const metadataYaml = fs.readFileSync('../nhost/metadata/tables.yaml', 'utf8');
  const metadataObj = yaml.load(metadataYaml);

  console.log('Replacing Metadata...');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': adminSecret
    },
    body: JSON.stringify({
      type: 'replace_metadata',
      args: metadataObj
    })
  });
  
  const json = await res.json();
  if (json.error || json.is_error) {
    console.error('Metadata Error:', json);
  } else {
    console.log('Metadata Replacement Success!', json);
  }
}

run().catch(console.error);
