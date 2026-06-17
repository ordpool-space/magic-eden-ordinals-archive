# Magic Eden Ordinals Archive

A frozen snapshot of every collection and inscription Magic Eden had on file for Bitcoin ordinals, captured before they shut down their ordinals business in March 2026.

## What's here

| | |
|---|---|
| Collections | **5,466** |
| Inscription IDs | **8,379,744** |
| Cumulative trading volume on ME | **34,264 BTC** |
| Total size | **226 MB** (gzipped) |

## Layout

```
index.csv                      Ranked collection list (~200 KB)
inscriptions/{symbol}.csv.gz   One file per collection (~42 KB avg)
```

### `index.csv`

CSV with header `symbol,name,totalVolume`, sorted by `totalVolume` descending. Collections with no recorded trading volume are sorted by name. RFC 4180 quoting for names containing commas/quotes.

```csv
symbol,name,totalVolume
nodemonkes,NodeMonkes,520959757463
runestone,Runestone,376795368612
bitcoin-puppets,Bitcoin Puppets,332202885087
...
```

`totalVolume` is in **sats** (1 BTC = 100,000,000 sats). It's cumulative lifetime ME trading volume per collection.

### `inscriptions/{symbol}.csv.gz`

Gzipped CSV with header `id,contentType`. One row per inscription. No particular order.

```csv
id,contentType
053c67c5b118511203e89541386bd37dac451c0e41ea7ae82f065b805b2ae703i0,image/png
b099cd5b41a50c4af026c99e08cabbd7b611a8879aa90dcdf9f768dd8f77e605i0,image/png
...
```

`id` is the standard inscription ID format (`<64 hex>i<index>`). `contentType` is the MIME type as ME recorded it; the value can be empty for a handful of weird records (~1,500 of 8.4M).

## Top 10 collections by trading volume

| # | Symbol | Name | Total volume (BTC) |
|---|---|---|---|
| 1 | `nodemonkes` | NodeMonkes | 5,209.60 |
| 2 | `runestone` | Runestone | 3,767.95 |
| 3 | `bitcoin-puppets` | Bitcoin Puppets | 3,322.03 |
| 4 | `omb` | Ordinal Maxi Biz (OMB) | 2,141.78 |
| 5 | `quantum_cats` | Quantum Cats | 1,690.97 |
| 6 | `rsic` | RSIC METAPROTOCOL | 1,683.20 |
| 7 | `bitcoin-frogs` | Bitcoin Frogs | 1,517.59 |
| 8 | `runes_pups` | Rune Pups (Concluded) | 836.43 |
| 9 | `bitmap` | bitmap | 787.52 |
| 10 | `dmtnatcats` | Natcats | 643.99 |

## Content type breakdown

Of 8.4M inscriptions:

| Share | Type |
|---|---|
| 36% | `text/plain` (with/without charset) — mostly BRC-20 ops, runes, sat names |
| 26% | `text/html` (with/without charset) — interactive inscriptions |
| 27% | image (`png`, `webp`, `jpeg`, `svg+xml`, `gif`, `avif`, `bmp`, `apng`) |
| 3% | `model/gltf-binary` (3D models) |
| 3% | `video/mp4`, `video/webm` |
| 2% | `application/json` |
| <0.1% | other (audio, pdf, markdown, …) |

## How to consume

```ts
import { gunzipSync } from 'zlib';

const BASE = 'https://ordpool-space.github.io/magic-eden-ordinals-archive';

// Index
const indexResp = await fetch(`${BASE}/index.csv`);
const index = (await indexResp.text())
  .trim().split('\n').slice(1)
  .map(line => {
    // RFC 4180 — minimal parser; use a library if you have unusual names
    const [symbol, name, totalVolume] = line.split(',');
    return { symbol, name, totalVolume: Number(totalVolume) };
  });

// One collection
const csvResp = await fetch(`${BASE}/inscriptions/${symbol}.csv.gz`);
const csv = gunzipSync(Buffer.from(await csvResp.arrayBuffer())).toString();
const inscriptions = csv.trim().split('\n').slice(1)
  .map(line => {
    const [id, contentType] = line.split(',');
    return { id, contentType };
  });
```

(Browser fetch usually auto-decompresses via `Content-Encoding`; on Node you decompress yourself as above.)
