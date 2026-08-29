const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const secret = crypto.randomBytes(48).toString('base64url');
const hash = crypto.createHash('sha256').update(secret).digest('hex');
const r = spawnSync('cmd.exe', ['/d','/s','/c',`npx vercel env add ORBITFS_DB_SECRET production --value "${secret}" --yes --sensitive --force`], { cwd: process.cwd(), encoding:'utf8' });
if (r.status !== 0) { console.error(String(r.error?.message || r.stderr || r.stdout || `Failed with ${r.status}`)); process.exit(1); }
console.log(hash);
