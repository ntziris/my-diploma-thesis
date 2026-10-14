#!/usr/bin/env node
// Usage: node fetch-artwork.mjs <artwork id> [--number GA-2026-0002] [--place Αθήνα]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { SuiGrpcClient } from "@mysten/sui/grpc";

// paths are resolved against this file, so the fetcher runs from anywhere
const here = import.meta.dirname;

const args = process.argv.slice(2);
const artworkId = args.find((a) => a.startsWith("0x"));
if (!artworkId) {
  console.error(
    "usage: node fetch-artwork.mjs <artwork id> [--number N] [--place P]",
  );
  process.exit(1);
}
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  const value = i >= 0 ? args[i + 1] : undefined;
  return value && !value.startsWith("--") ? value : fallback;
};

const deployment = JSON.parse(
  readFileSync(join(here, "../scripts/deployment.testnet.json"), "utf8"),
);
const AGGREGATOR = "https://aggregator.walrus-testnet.walrus.space";
const SITE = deployment.siteUrl ?? "https://art-tokenization.duckdns.org";
const EXPLORER = `https://suiscan.xyz/${deployment.network}`;

const client = new SuiGrpcClient({
  network: deployment.network,
  baseUrl: "https://fullnode.testnet.sui.io:443",
});
const json = async (objectId) =>
  (await client.getObject({ objectId, include: { json: true } })).object.json;

const art = await json(artworkId);
if (!art?.title) throw new Error("not an artwork: " + artworkId);

// custody record: dynamic object field of the artwork
const fields = await client.listDynamicFields({
  parentId: artworkId,
  limit: 50,
});
const custodyField = fields.dynamicFields.find((f) =>
  f.valueType.endsWith("::custody::CustodyRecord"),
);
const custody = custodyField
  ? await json(custodyField.childId ?? custodyField.fieldId)
  : null;
const galleryAddress = custody?.gallery ?? art.intended_gallery ?? "";

// gallery name from the registry table
let galleryName = "";
if (galleryAddress) {
  const reg = await json(deployment.galleryRegistry);
  const entries = await client.listDynamicFields({
    parentId: reg.entries.id,
    limit: 50,
  });
  const wrappers = await client.getObjects({
    objectIds: entries.dynamicFields.map((f) => f.fieldId),
    include: { json: true },
  });
  const entry = wrappers.objects.find((o) => o.json?.name === galleryAddress);
  galleryName = entry?.json?.value?.name ?? "";
}

// preview image
mkdirSync(join(here, "assets"), { recursive: true });
mkdirSync(join(here, "data"), { recursive: true });
const short = artworkId.slice(2, 10);
const imagePath = `assets/${short}.jpg`;
// blob ids are 43 characters; longer ids are quilt patch ids of the first deployments
const imagePath_ =
  art.image_blob_id.length > 43
    ? `by-quilt-patch-id/${art.image_blob_id}`
    : art.image_blob_id;
const res = await fetch(`${AGGREGATOR}/v1/blobs/${imagePath_}`);
if (!res.ok) throw new Error(`image download failed: ${res.status}`);
writeFileSync(join(here, imagePath), Buffer.from(await res.arrayBuffer()));

const today = new Date();
const greekDate = new Intl.DateTimeFormat("el-GR", {
  day: "numeric",
  month: "long",
  year: "numeric",
}).format(today);
const initials =
  galleryName
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 3) || "GA";
const sinceDate = custody
  ? new Intl.DateTimeFormat("el-GR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(Number(custody.since)))
  : greekDate;

const data = {
  gallery: {
    name: galleryName || "Πιστοποιημένη γκαλερί",
    subtitle: "Πιστοποιημένη γκαλερί",
    initials,
    address: galleryAddress,
  },
  artwork: {
    title: art.title,
    artist_name: art.artist_name,
    year: art.year,
    medium: art.medium,
    dimensions: art.dimensions,
    id: artworkId,
    image: imagePath,
  },
  statement: `Η ${galleryName || "γκαλερί"} βεβαιώνει ότι εξέτασε το φυσικό έργο που περιγράφεται παραπάνω, το οποίο παρέλαβε σε φύλαξη στις ${sinceDate}, και ότι κατά την κρίση της πρόκειται για πρωτότυπο έργο. [Συμπληρώστε τη μέθοδο και τα ευρήματα της εξέτασης.]`,
  chain: {
    network: deployment.network,
    package: deployment.packageId,
    explorer: EXPLORER,
    verify_url: `${SITE}/verify/${artworkId}`,
  },
  certificate: {
    number: opt("number", `${initials}-${today.getFullYear()}-0001`),
    date: greekDate,
    place: opt("place", "Αθήνα"),
  },
};
const out = `data/${short}.json`;
writeFileSync(join(here, out), JSON.stringify(data, null, 2) + "\n");
console.log(
  `-> ${out}\n-> ${imagePath}\nnext: edit the statement, then ./build.sh ${out}`,
);
