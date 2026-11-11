require('dotenv').config();
const { getPreviewStatus } = require('../src/services/cloudSyncService');

async function main() {
  console.log('Testing getPreviewStatus()...');
  const res = await getPreviewStatus();
  console.log('Preview Result:', JSON.stringify(res, null, 2));
}

main();
