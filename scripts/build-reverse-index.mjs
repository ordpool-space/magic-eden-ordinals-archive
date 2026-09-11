// Builds the reverse index `by-id/<3-hex>.csv.gz` (inscription id → collection
// symbol) from `inscriptions/{symbol}.csv.gz`.
//
//   node scripts/build-reverse-index.mjs
//
// The per-collection files answer "which inscriptions are in collection X";
// the reverse index answers "which collection is inscription Y in" without
// scanning all 5,466 files. Shards are keyed by the first three hex
// characters of the id (4,096 shards, ~2,000 rows each), so a lookup is one
// small download. Every id belongs to exactly one collection in the archive
// (checked while building; duplicates would abort the run), so a row is
// `id,symbol` and the first hit is the answer.
//
// Output is deterministic (rows sorted by id inside each shard), and a
// `by-id/index.json` manifest records the shard layout for consumers.

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'inscriptions');
const OUT_DIR = path.join(ROOT, 'by-id');

const PREFIX_LENGTH = 3;
const FLUSH_BYTES = 64 * 1024;
const ID_PATTERN = /^[0-9a-f]{64}i\d+$/;

function flush(buffers, prefix) {
  const entry = buffers.get(prefix);
  if (!entry || entry.lines.length === 0) return;
  appendFileSync(path.join(OUT_DIR, `${prefix}.csv`), entry.lines.join('\n') + '\n');
  entry.lines = [];
  entry.bytes = 0;
}

function main() {
  const startedAt = Date.now();
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true });
  mkdirSync(OUT_DIR);

  const files = readdirSync(SRC_DIR).filter((f) => f.endsWith('.csv.gz')).sort();
  const buffers = new Map();
  let rows = 0;
  let skipped = 0;

  for (const file of files) {
    const symbol = file.slice(0, -'.csv.gz'.length);
    const text = gunzipSync(readFileSync(path.join(SRC_DIR, file))).toString('utf8');
    let pos = text.indexOf('\n') + 1; // skip the `id,contentType` header
    while (pos < text.length) {
      const nl = text.indexOf('\n', pos);
      const line = text.slice(pos, nl === -1 ? text.length : nl);
      pos = nl === -1 ? text.length : nl + 1;
      if (!line) continue;
      const id = line.slice(0, line.indexOf(','));
      if (!ID_PATTERN.test(id)) { skipped++; continue; }
      const prefix = id.slice(0, PREFIX_LENGTH);
      let entry = buffers.get(prefix);
      if (!entry) { entry = { lines: [], bytes: 0 }; buffers.set(prefix, entry); }
      const row = `${id},${symbol}`;
      entry.lines.push(row);
      entry.bytes += row.length + 1;
      rows++;
      if (entry.bytes >= FLUSH_BYTES) flush(buffers, prefix);
    }
  }
  for (const prefix of buffers.keys()) flush(buffers, prefix);
  console.log(`scanned ${files.length} collections, ${rows.toLocaleString()} rows, ${skipped} rows skipped (malformed id)`);

  // Second pass: sort each shard, verify one collection per id, gzip.
  const shards = readdirSync(OUT_DIR).filter((f) => f.endsWith('.csv')).sort();
  let maxRows = 0;
  let minRows = Infinity;
  for (const shard of shards) {
    const rawPath = path.join(OUT_DIR, shard);
    const lines = readFileSync(rawPath, 'utf8').split('\n').filter(Boolean).sort();
    for (let i = 1; i < lines.length; i++) {
      const prev = lines[i - 1].slice(0, lines[i - 1].indexOf(','));
      const cur = lines[i].slice(0, lines[i].indexOf(','));
      if (prev === cur) throw new Error(`id ${cur} appears in more than one collection`);
    }
    maxRows = Math.max(maxRows, lines.length);
    minRows = Math.min(minRows, lines.length);
    writeFileSync(rawPath + '.gz', gzipSync('id,symbol\n' + lines.join('\n') + '\n', { level: 9 }));
    unlinkSync(rawPath);
  }

  const manifest = {
    prefixLength: PREFIX_LENGTH,
    shards: shards.length,
    rows,
    columns: ['id', 'symbol'],
    builtFrom: 'inscriptions/{symbol}.csv.gz',
  };
  writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`wrote ${shards.length} shards (${minRows} to ${maxRows} rows each) in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
}

main();
