// Run every example against the network in JANZEER_NODE_URL (see sdk_conformance/e2e/node-up.sh).
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
if (!process.env.JANZEER_NODE_URL) { console.error('JANZEER_NODE_URL is not set'); process.exit(1); }
let failed = 0;
for (const f of readdirSync(new URL('../examples/', import.meta.url)).filter((f) => f.endsWith('.ts')).sort()) {
  console.log(`\n=== examples/${f}`);
  const r = spawnSync('npx', ['tsx', `examples/${f}`], { stdio: 'inherit', env: process.env });
  if (r.status !== 0) failed++;
}
process.exit(failed ? 1 : 0);
