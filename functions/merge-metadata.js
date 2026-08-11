const fs = require('fs');
const yaml = require('js-yaml');

async function run() {
  const adminSecret = 'asdfghkl;';
  const url = 'https://hthdfihfecprluniowpi.hasura.eu-central-1.nhost.run/v1/metadata';

  // Load current metadata (contains auth, storage, etc + configuration)
  const currentMetadata = JSON.parse(fs.readFileSync('current_metadata.json', 'utf8'));
  
  // Load my project metadata
  const projectMetadata = yaml.load(fs.readFileSync('../nhost/metadata/tables.yaml', 'utf8'));

  // Merge the sources
  const currentDefaultSource = currentMetadata.sources.find(s => s.name === 'default');
  const projectDefaultSource = projectMetadata.sources.find(s => s.name === 'default');

  // We want to KEEP all existing tables from current (like auth, storage) 
  // AND add/update our new tables.
  const myTableNames = projectDefaultSource.tables.map(t => t.table.name);
  
  // Filter out existing versions of our tables if they exist
  const existingTablesWithoutOurs = currentDefaultSource.tables.filter(t => !myTableNames.includes(t.table.name));
  
  // Combine tables
  currentDefaultSource.tables = [...existingTablesWithoutOurs, ...projectDefaultSource.tables];

  // Merge Actions
  currentMetadata.actions = projectMetadata.actions || [];
  currentMetadata.custom_types = projectMetadata.custom_types || {};

  // Merge Cron Triggers
  currentMetadata.cron_triggers = projectMetadata.cron_triggers || [];

  console.log('Sending merged metadata...');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': adminSecret
    },
    body: JSON.stringify({
      type: 'replace_metadata',
      args: currentMetadata
    })
  });
  
  const json = await res.json();
  if (json.error || json.is_error) {
    console.error('Metadata Error:', JSON.stringify(json, null, 2));
  } else {
    console.log('Metadata Replacement Success!');
  }
}

run().catch(console.error);
