// Verify the vendored conformance vectors against their SHA256SUMS (drift from sdk_conformance/ fails CI).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const dir = new URL('../test/vectors/', import.meta.url);
let bad = 0;
for (const line of readFileSync(new URL('SHA256SUMS', dir), 'utf8').trim().split('\n')) {
  const [sha, name] = line.split(/\s+/);
  const actual = createHash('sha256').update(readFileSync(new URL(name, dir))).digest('hex');
  console.log(`${actual === sha ? 'OK  ' : 'DRIFT'} ${name}`);
  if (actual !== sha) bad++;
}
process.exit(bad ? 1 : 0);
