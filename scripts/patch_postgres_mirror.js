const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'src', 'utils', 'postgresMirror.js');
let c = fs.readFileSync(file, 'utf8');

c = c.replace(/function isConfigured\(\) \{[\s\S]*?return Boolean\([\s\S]*?\);[\s\S]*?\}/, `function isConfigured() {
  return Boolean(
    process.env.ENABLE_PG_MIRROR === "true" &&
      process.env.PGHOST &&
      process.env.PGUSER &&
      process.env.PGPASSWORD &&
      process.env.PGDATABASE,
  );
}`);

fs.writeFileSync(file, c, 'utf8');
console.log('postgresMirror.js successfully patched with ENABLE_PG_MIRROR check!');
