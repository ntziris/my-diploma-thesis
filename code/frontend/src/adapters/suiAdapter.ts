import type { SuiClientTypes } from '@mysten/sui/client';
import { bcs } from '@mysten/sui/bcs';
import { deriveDynamicFieldID, fromBase64, toHex } from '@mysten/sui/utils';
import { config } from '@/config';
import { suiClient as client } from './suiClient';
import type {
  Address,
  Artwork,
  CatalogSummary,
  Certificate,
  ChainAdapter,
  ChainEvent,
  ChainEventType,
  Custody,
  Fraction,
  GalleryEntry,
  Lifecycle,
  Listing,
  ObjectId,
  Page,
  PlatformStats,
  ProtocolParams,
  RedemptionRequest,
  ReportLog,
  SourceEntry,
  SourceKind,
  StatusCondition,
  WorksOf,
} from './types';

const PKG = config.packageId;
// Types and events are named by the defining package; a call names the version the caller used
const PACKAGE_VERSIONS = [...new Set([config.packageId, config.latestPackageId])];
const CHUNK = 100;
const FEED_PAGE = 25;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fields = Record<string, any>;
type Obj = SuiClientTypes.Object<{ json: true }>;

function fieldsOf(o: Obj | Error | null | undefined): Fields | null {
  if (!o || o instanceof Error) return null;
  return (o.json as Fields | null) ?? null;
}

function typeOf(o: Obj | Error | null | undefined): string {
  return !o || o instanceof Error ? '' : o.type;
}

// Option<T> arrives as the value or null, or as { vec: [] }
function opt<T>(v: unknown): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object' && v !== null && 'vec' in v) {
    const vec = (v as { vec: T[] }).vec;
    return vec.length ? vec[0] : null;
  }
  return v as T;
}

function inner(v: unknown): Fields | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object' && 'fields' in (v as object)) return (v as { fields: Fields }).fields;
  return v as Fields;
}

// A Table or UID field: gRPC flattens UID to the id string
function idOf(v: unknown): string {
  if (typeof v === 'string') return v;
  const f = inner(v);
  if (!f) return '';
  if (typeof f.id === 'string') return f.id;
  return idOf(f.id);
}

const iso = (ms: unknown) => new Date(Number(ms)).toISOString();
const hexOf = (b64: unknown) => (typeof b64 === 'string' && b64 ? toHex(fromBase64(b64)) : '');
const bytesHex = (v: unknown) =>
  Array.isArray(v) ? toHex(Uint8Array.from(v as number[])) : hexOf(v);
const isoDate = (ms: unknown) => iso(ms).slice(0, 10);
const mist = (v: unknown) => BigInt(String(v ?? 0));
const num = (v: unknown) => Number(v ?? 0);

// The public node rate-limits per IP: retry 429 and 503 only
async function withRetry<T>(op: () => PromiseLike<T>, attempts = 4): Promise<T> {
  let delay = 400;
  for (let i = 1; ; i++) {
    try {
      return await op();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const throttled =
        /\b(429|503)\b|Too Many|Failed to fetch|UNAVAILABLE|RESOURCE_EXHAUSTED/i.test(msg);
      if (!throttled || i >= attempts) throw e;
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2.5;
    }
  }
}

const CONCURRENCY = 4;

async function pooled<T, R>(items: readonly T[], job: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await job(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return out;
}

async function multiGet(ids: ObjectId[]): Promise<(Obj | Error)[]> {
  if (!ids.length) return [];
  const slices: ObjectId[][] = [];
  for (let i = 0; i < ids.length; i += 50) slices.push(ids.slice(i, i + 50));
  const pages = await pooled(slices, (slice) =>
    withRetry(() => client.getObjects({ objectIds: slice, include: { json: true } })),
  );
  return pages.flatMap((p) => p.objects);
}

async function getOne(objectId: ObjectId): Promise<Obj | null> {
  try {
    return (await withRetry(() => client.getObject({ objectId, include: { json: true } }))).object;
  } catch (e) {
    if (/not ?found|NOT_FOUND|does not exist/i.test(e instanceof Error ? e.message : String(e)))
      return null;
    throw e;
  }
}

function ownerAddress(o: Obj | null): Address | null {
  const owner = o?.owner as
    | {
        $kind?: string;
        AddressOwner?: string;
        ConsensusAddressOwner?: { owner?: string };
      }
    | undefined;
  if (!owner) return null;
  if (owner.$kind === 'AddressOwner' && owner.AddressOwner) return owner.AddressOwner;
  if (owner.$kind === 'ConsensusAddressOwner' && owner.ConsensusAddressOwner?.owner)
    return owner.ConsensusAddressOwner.owner;
  return null;
}

const u64Entry = (table: ObjectId, index: number) =>
  deriveDynamicFieldID(table, 'u64', bcs.u64().serialize(index).toBytes());

const addressEntry = (table: ObjectId, address: Address) =>
  deriveDynamicFieldID(table, 'address', bcs.Address.serialize(address).toBytes());

const stringEntry = (table: ObjectId, key: string) =>
  deriveDynamicFieldID(table, '0x1::string::String', bcs.string().serialize(key).toBytes());

// A fieldless Move struct serialises as one zero byte, its dummy_field
const EMPTY_STRUCT = new Uint8Array([0]);

function dofId(parent: ObjectId, key: string): ObjectId {
  return deriveDynamicFieldID(
    parent,
    `0x2::dynamic_object_field::Wrapper<${PKG}::${key}>`,
    EMPTY_STRUCT,
  );
}

const historyEntry = (artwork: ObjectId, index: number) =>
  deriveDynamicFieldID(
    artwork,
    `${PKG}::artwork::HistoryKey`,
    bcs.u64().serialize(index).toBytes(),
  );

// Reads cached until notifyChainChanged drops them all
const cycle = new Map<string, Promise<unknown>>();

function cached<T>(key: string, read: () => Promise<T>): Promise<T> {
  let p = cycle.get(key) as Promise<T> | undefined;
  if (!p) {
    p = read();
    cycle.set(key, p);
    p.catch(() => cycle.delete(key));
  }
  return p;
}

function catalogObject() {
  return cached('catalog', async () => fieldsOf(await getOne(config.objects.catalog)));
}
function statsObject() {
  return cached('stats', async () => fieldsOf(await getOne(config.objects.stats)));
}
function channelStatsObject() {
  return cached('channelStats', async () => fieldsOf(await getOne(config.objects.channelStats)));
}

interface RegistryEntry {
  address: Address;
  name: string;
  kind: string;
  since: string;
  active: boolean;
  revokedAt?: string;
}

async function readRegistry(regId: ObjectId): Promise<RegistryEntry[]> {
  const reg = fieldsOf(await getOne(regId));
  if (!reg) return [];
  const members = (reg.members ?? []) as Address[];
  const table = idOf(reg.entries);
  const entries = await multiGet(members.map((m) => addressEntry(table, m)));
  return members.flatMap((address, i) => {
    const v = inner(fieldsOf(entries[i])?.value);
    if (!v) return [];
    const revoked = opt<string>(v.revoked_at);
    return [
      {
        address,
        name: String(v.name),
        kind: String(v.kind),
        since: isoDate(v.since),
        active: Boolean(v.active),
        revokedAt: revoked ? isoDate(revoked) : undefined,
      },
    ];
  });
}

const registries = () =>
  cached('registries', async () => {
    const [galleries, sources] = await Promise.all([
      readRegistry(config.objects.galleryRegistry),
      readRegistry(config.objects.sourceRegistry),
    ]);
    return { galleries, sources };
  });

function nameOf(entries: RegistryEntry[], address: Address): string {
  return entries.find((e) => e.address === address)?.name ?? '';
}

const LIFECYCLE: Lifecycle[] = [
  'minted',
  'in_custody',
  'certified',
  'fractionalized',
  'redeemed',
  'lost',
  'cancelled',
];
const CONDITIONS: StatusCondition[] = ['ok', 'damaged', 'destroyed', 'missing'];
const HISTORY_KIND: ChainEventType[] = [
  'mint',
  'mint_cancelled',
  'custody_intake',
  'custody_reassigned',
  'certificate_issued',
  'fractionalized',
  'consolidated',
  'listing_created',
  'listing_cancelled',
  'sale',
  'redeem_requested',
  'redeem_withdrawn',
  'redeemed',
  'loss_declared',
];

function imageUrl(blobId: string): string {
  return blobId ? config.walrus.url(blobId) : '';
}

function summaryOf(e: Fields, position: number): CatalogSummary {
  return {
    id: String(e.artwork),
    position,
    title: String(e.title ?? ''),
    artistName: String(e.artist_name ?? ''),
    artist: String(e.artist),
    year: String(e.year ?? ''),
    medium: String(e.medium ?? ''),
    image: imageUrl(String(e.image_blob_id ?? '')),
    imageBlobId: String(e.image_blob_id ?? ''),
    mintedAt: iso(e.minted_at),
    lifecycle: LIFECYCLE[num(e.state)] ?? 'minted',
    custodian: opt<string>(e.custodian),
    lastActivityAt: iso(e.last_activity_at),
  };
}

interface ArtworkParts {
  children: (Obj | Error)[];
  log: Obj | Error | null;
}

const ARTWORK_KEYS = ['custody::CustodyKey', 'certificate::CertificateKey'] as const;
const NO_PARTS: ArtworkParts = { children: [], log: null };

async function artworkChildren(ids: ObjectId[]): Promise<Map<ObjectId, ArtworkParts>> {
  const wanted = ids.flatMap((id) => ARTWORK_KEYS.map((k) => ({ id, fieldId: dofId(id, k) })));
  const fields = await multiGet(wanted.map((w) => w.fieldId));
  const links = wanted
    .map((w, i) => ({
      id: w.id,
      child: String(fieldsOf(fields[i])?.value ?? ''),
    }))
    .filter((l) => l.child);
  const children = await multiGet(links.map((l) => l.child));

  const out = new Map<ObjectId, ArtworkParts>();
  links.forEach((l, i) => {
    const parts = out.get(l.id) ?? { children: [], log: null };
    parts.children.push(children[i]);
    out.set(l.id, parts);
  });

  const logOf: { id: ObjectId; log: ObjectId }[] = [];
  for (const [id, parts] of out) {
    for (const child of parts.children) {
      if (typeOf(child) !== `${PKG}::custody::CustodyRecord`) continue;
      const log = String(fieldsOf(child)?.report_log ?? '');
      if (log) logOf.push({ id, log });
    }
  }
  const logs = await multiGet(logOf.map((l) => l.log));
  logOf.forEach((l, i) => {
    const parts = out.get(l.id);
    if (parts) parts.log = logs[i];
  });

  return out;
}

function reportLogOf(o: Obj | Error | null): ReportLog | null {
  const f = fieldsOf(o);
  if (!f) return null;
  const last = opt<string>(f.last);
  return {
    id: idOf(f.id),
    count: num(f.count),
    notOk: num(f.not_ok),
    last: last
      ? {
          id: last,
          condition: CONDITIONS[num(f.last_condition)] ?? 'ok',
          at: iso(f.last_at),
        }
      : null,
  };
}

function buildArtwork(
  resp: Obj | Error,
  regs: { galleries: RegistryEntry[] },
  vaults: Map<ObjectId, number>,
  parts: ArtworkParts,
): Artwork | null {
  const f = fieldsOf(resp);
  if (!f || typeOf(resp) !== `${PKG}::artwork::Artwork`) return null;
  const id = idOf(f.id);
  let certificate: Certificate | null = null;
  let custody: Custody | null = null;
  let redemption: RedemptionRequest | null = null;
  for (const child of parts.children) {
    const c = fieldsOf(child);
    const t = typeOf(child);
    if (!c) continue;
    if (t === `${PKG}::certificate::Certificate`) {
      certificate = {
        issuer: c.issuer,
        issuerName: nameOf(regs.galleries, c.issuer),
        issuedAt: isoDate(c.issued_at),
        statement: c.statement,
        documentationBlobId: c.documentation_blob_id || undefined,
      };
    } else if (t === `${PKG}::custody::CustodyRecord`) {
      const until = opt<string>(c.until);
      custody = {
        gallery: c.gallery,
        galleryName: nameOf(regs.galleries, c.gallery),
        since: isoDate(c.since),
        until: until ? isoDate(until) : undefined,
      };
      const r = inner(opt(c.redemption));
      if (r)
        redemption = {
          requestedBy: r.requested_by,
          at: iso(r.at),
          note: r.note,
        };
    }
  }
  const reportLog = reportLogOf(parts.log);
  const intended = opt<string>(f.intended_gallery);
  const vault = opt<string>(f.vault);
  const m = inner(f.market) ?? {};
  const lastPrice = mist(m.last_price);
  return {
    id,
    title: f.title,
    artist: f.artist,
    artistName: f.artist_name,
    year: f.year,
    medium: f.medium,
    dimensions: f.dimensions,
    description: f.description,
    image: imageUrl(f.image_blob_id),
    imageBlobId: f.image_blob_id,
    hiresBlobId: f.hires_blob_id,
    sealSalt: bytesHex(f.seal_salt),
    storage: Array.isArray(f.storage) ? f.storage.map(String) : [],
    mintedAt: iso(f.minted_at),
    owner: opt<string>(f.owner),
    lifecycle: LIFECYCLE[num(f.state)] ?? 'minted',
    custody,
    intendedGallery: intended
      ? {
          gallery: intended,
          galleryName: nameOf(regs.galleries, intended),
          since: '',
          byAuthority: Boolean(f.intended_by_authority),
        }
      : null,
    certificate,
    fractions: vault ? { vaultId: vault, total: vaults.get(vault) ?? num(m.supply) } : null,
    redemption,
    market: {
      supply: num(m.supply),
      openListings: num(m.open_listings),
      trades: num(m.trades),
      volumeMist: mist(m.volume_mist),
      lastPrice: lastPrice > 0n ? lastPrice : null,
    },
    historyLen: num(f.history_len),
    reportLog,
    lastReport: reportLog?.last ?? null,
  };
}

async function loadArtworks(ids: ObjectId[]): Promise<Artwork[]> {
  if (!ids.length) return [];
  const [objs, regs] = await Promise.all([multiGet(ids), registries()]);
  const vaultIds = objs.map((o) => opt<string>(fieldsOf(o)?.vault)).filter((v): v is string => !!v);
  const vaults = new Map<ObjectId, number>();
  for (const v of await multiGet(vaultIds)) {
    const vf = fieldsOf(v);
    if (vf) vaults.set(idOf(vf.id), num(vf.total_supply));
  }
  const children = await artworkChildren(ids);
  return objs
    .map((o) =>
      buildArtwork(o, regs, vaults, children.get(idOf(fieldsOf(o)?.id ?? '')) ?? NO_PARTS),
    )
    .filter((a): a is Artwork => !!a);
}

function listingOf(o: Obj | Error): Listing | null {
  const l = fieldsOf(o);
  if (!l || typeOf(o) !== `${PKG}::market::Listing`) return null;
  const escrow = inner(opt(l.escrow));
  return {
    id: idOf(l.id),
    artworkId: l.artwork_id as string,
    vaultId: l.vault_id as string,
    seller: l.seller as string,
    quantity: escrow ? num(escrow.amount) : 0,
    pricePerFraction: mist(l.price_per_fraction),
    active: Boolean(l.active),
  };
}

const byPrice = (a: Listing, b: Listing) =>
  a.pricePerFraction < b.pricePerFraction ? -1 : a.pricePerFraction > b.pricePerFraction ? 1 : 0;

type EventLike = Pick<SuiClientTypes.Event, 'eventType' | 'module' | 'json'> & {
  transactionDigest: string;
  eventIndex: number;
};

function mapEvent(
  e: EventLike,
  regs: { galleries: RegistryEntry[]; sources: RegistryEntry[] },
): ChainEvent | null {
  const name = e.eventType.split('::').pop() ?? '';
  const module = e.module;
  const j = (e.json ?? {}) as Fields;
  const base = {
    id: `${e.transactionDigest}:${e.eventIndex}`,
    at: j.at != null ? iso(j.at) : '',
    txDigest: e.transactionDigest,
  };
  const ev = (type: ChainEventType, rest: Partial<ChainEvent>): ChainEvent => ({
    ...base,
    type,
    ...rest,
  });
  switch (`${module}::${name}`) {
    case 'registry::Registered': {
      const isGallery = j.registry === config.objects.galleryRegistry;
      return ev(isGallery ? 'gallery_registered' : 'source_registered', {
        actor: j.by,
        target: j.who,
        targetName: j.name,
        note: j.kind || undefined,
      });
    }
    case 'registry::Revoked': {
      const isGallery = j.registry === config.objects.galleryRegistry;
      const entries = isGallery ? regs.galleries : regs.sources;
      return ev(isGallery ? 'gallery_revoked' : 'source_revoked', {
        actor: j.by,
        target: j.who,
        targetName: nameOf(entries, j.who),
      });
    }
    case 'admin::RoyaltyChanged':
      return ev('royalty_updated', {
        actor: j.by,
        oldValue: num(j.old_bps),
        newValue: num(j.new_bps),
      });
    case 'report::WindowChanged':
      return ev('window_updated', {
        actor: j.by,
        oldValue: num(j.old_ms),
        newValue: num(j.new_ms),
      });
    case 'report::EnclaveAccepted':
      return ev('enclave_accepted', {
        actor: j.by,
        reference: String(j.enclave),
        newValue: num(j.config_version),
        note: opt<string>(j.previous) ?? undefined,
      });
    case 'report::EnclaveCleared':
      return ev('enclave_cleared', {
        actor: j.by,
        note: opt<string>(j.previous) ?? undefined,
      });
    case 'report::EndpointChanged':
      return ev('endpoint_updated', {
        actor: j.by,
        oldText: String(j.old_url ?? ''),
        newText: String(j.new_url ?? ''),
      });
    case 'artwork::ArtworkMinted':
      return ev('mint', {
        artworkId: j.artwork,
        actor: j.artist,
        target: j.intended_gallery,
        targetName: nameOf(regs.galleries, j.intended_gallery),
      });
    case 'artwork::MintCancelled':
      return ev('mint_cancelled', { artworkId: j.artwork, actor: j.by });
    case 'custody::CustodyRecorded':
      return ev('custody_intake', {
        artworkId: j.artwork,
        actor: j.gallery,
        note: j.after_reassignment ? 'μετά από ανάθεση της αρχής' : undefined,
      });
    case 'custody::CustodyReassigned':
      return ev('custody_reassigned', {
        artworkId: j.artwork,
        actor: j.by,
        target: j.to,
        targetName: nameOf(regs.galleries, j.to),
      });
    case 'certificate::CertificateIssued':
      return ev('certificate_issued', {
        artworkId: j.artwork,
        actor: j.issuer,
      });
    case 'fraction::Fractionalised':
      return ev('fractionalized', {
        artworkId: j.artwork,
        actor: j.by,
        totalFractions: num(j.total_supply),
      });
    case 'fraction::Consolidated':
      return ev('consolidated', { artworkId: j.artwork, actor: j.by });
    case 'market::ListingCreated':
      return ev('listing_created', {
        artworkId: j.artwork,
        actor: j.seller,
        seller: j.seller,
        quantity: num(j.quantity),
        pricePerFraction: mist(j.price_per_fraction),
      });
    case 'market::ListingCancelled':
      return ev('listing_cancelled', {
        artworkId: j.artwork,
        actor: j.seller,
        seller: j.seller,
        quantity: num(j.quantity),
      });
    case 'market::Sale':
      return ev('sale', {
        artworkId: j.artwork,
        actor: j.buyer,
        buyer: j.buyer,
        seller: j.seller,
        quantity: num(j.quantity),
        pricePerFraction: mist(j.price_per_fraction),
        sellerAmount: mist(j.seller_amount),
        royaltyAmount: mist(j.royalty_amount),
        amount: mist(j.seller_amount) + mist(j.royalty_amount),
      });
    case 'custody::RedemptionRequested':
      return ev('redeem_requested', {
        artworkId: j.artwork,
        actor: j.by,
        note: j.note,
      });
    case 'custody::RedemptionWithdrawn':
      return ev('redeem_withdrawn', { artworkId: j.artwork, actor: j.by });
    case 'custody::Redeemed':
      return ev('redeemed', {
        artworkId: j.artwork,
        actor: j.gallery,
        target: j.owner,
      });
    case 'custody::LossDeclared':
      return ev('loss_declared', {
        artworkId: j.artwork,
        actor: j.gallery,
        reportId: opt<string>(j.report) ?? undefined,
        reason: j.reason,
      });
    case 'report::ReportRecorded':
      return ev('status_report', {
        artworkId: j.artwork,
        actor: j.source,
        source: j.source,
        sourceName: nameOf(regs.sources, j.source),
        condition: CONDITIONS[num(j.condition)] ?? 'ok',
        reportId: j.report,
        readings: num(j.readings),
        attestedAt: j.attested_at != null ? iso(j.attested_at) : undefined,
      });
    default:
      return null;
  }
}

async function eventsPage(filter: string, cursor: string | null, limit: number) {
  return withRetry(() =>
    client.listEvents({
      filter: { eventType: filter },
      before: cursor,
      limit,
      order: 'descending',
    }),
  );
}

interface MergeState {
  cursors: Record<string, string | null>;
  done: Record<string, boolean>;
  buffers: Record<string, EventLike[]>;
}

function stampOf(e: EventLike): string {
  const at = (e.json as Fields | null)?.at;
  return at != null ? String(at).padStart(16, '0') : '';
}

// Several event filters merged newest first; the cursor carries every filter's cursor and buffer
async function mergedEvents(
  filters: readonly string[],
  cursor: string | null,
  regs: { galleries: RegistryEntry[]; sources: RegistryEntry[] },
): Promise<Page<ChainEvent>> {
  const state: MergeState = cursor
    ? (JSON.parse(cursor) as MergeState)
    : { cursors: {}, done: {}, buffers: {} };
  await pooled(filters, async (f) => {
    state.buffers[f] ??= [];
    if (state.buffers[f].length || state.done[f]) return;
    const page = await eventsPage(f, state.cursors[f] ?? null, FEED_PAGE);
    state.buffers[f].push(...page.events);
    state.cursors[f] = page.endCursor ?? null;
    state.done[f] = !page.hasNextPage;
  });
  const out: ChainEvent[] = [];
  while (out.length < FEED_PAGE) {
    let best: string | null = null;
    for (const f of filters) {
      const head = state.buffers[f][0];
      if (head && (best === null || stampOf(head) > stampOf(state.buffers[best][0]))) best = f;
    }
    if (best === null) break;
    const e = state.buffers[best].shift()!;
    const mapped = mapEvent(e, regs);
    if (mapped) out.push(mapped);
    if (!state.buffers[best].length && !state.done[best]) {
      const page = await eventsPage(best, state.cursors[best] ?? null, FEED_PAGE);
      state.buffers[best].push(...page.events);
      state.cursors[best] = page.endCursor ?? null;
      state.done[best] = !page.hasNextPage;
    }
  }
  const more = filters.some((f) => state.buffers[f].length || !state.done[f]);
  return { items: out, cursor: more ? JSON.stringify(state) : null, more };
}

const listeners = new Set<() => void>();
const watched = new Map<ObjectId, number>();
const versions = new Map<ObjectId, string>();

// Called by the signer after a transaction is final, and by the poller
export function notifyChainChanged() {
  cycle.clear();
  for (const l of listeners) l();
}

let poller: ReturnType<typeof setInterval> | null = null;

// The roots and the watched objects in one batched read; nothing is re-read unless a version moved
async function poll(): Promise<void> {
  const ids = [
    config.objects.catalog,
    config.objects.stats,
    config.objects.channelStats,
    config.objects.galleryRegistry,
    config.objects.sourceRegistry,
    ...watched.keys(),
  ].filter((id) => /^0x[0-9a-f]{64}$/i.test(id) && !/^0x0+$/.test(id));
  let objects: (SuiClientTypes.Object | Error)[];
  try {
    objects = (await withRetry(() => client.getObjects({ objectIds: [...new Set(ids)] }))).objects;
  } catch (e) {
    console.error('[chain] poll failed', e);
    return;
  }
  let changed = false;
  for (const o of objects) {
    if (o instanceof Error) continue;
    const before = versions.get(o.objectId);
    if (before !== undefined && before !== o.version) changed = true;
    versions.set(o.objectId, o.version);
  }
  if (changed) notifyChainChanged();
}

export const suiAdapter: ChainAdapter = {
  async getStats(): Promise<PlatformStats> {
    return cached('platformStats', async () => {
      const [catalog, stats, channel, regG, regS] = await multiGet([
        config.objects.catalog,
        config.objects.stats,
        config.objects.channelStats,
        config.objects.galleryRegistry,
        config.objects.sourceRegistry,
      ]);
      const c = fieldsOf(catalog) ?? {};
      const s = fieldsOf(stats) ?? {};
      const ch = fieldsOf(channel) ?? {};
      return {
        worksLive: num(c.live),
        worksTotal: num(c.count),
        galleriesActive: num(fieldsOf(regG)?.active_count),
        sourcesActive: num(fieldsOf(regS)?.active_count),
        fractionsOutstanding: num(s.fractions_outstanding),
        vaultsOpen: num(s.vaults_open),
        sales: num(s.sales),
        volumeMist: mist(s.volume_mist),
        royaltiesMist: mist(s.royalties_mist),
        openListings: num(s.open_listings),
        reportsTotal: num(ch.reports),
      };
    });
  },

  async catalogIndex(): Promise<CatalogSummary[]> {
    return cached('index', async () => {
      const catalog = await catalogObject();
      if (!catalog) return [];
      const table = idOf(catalog.chunks);
      const count = num(catalog.count);
      const chunkIds = Array.from({ length: Math.ceil(count / CHUNK) }, (_, k) =>
        u64Entry(table, k),
      );
      const chunks = await multiGet(chunkIds);
      return chunks.flatMap((chunk, k) => {
        const entries = (fieldsOf(chunk)?.value ?? []) as unknown[];
        return entries.flatMap((e, i) => {
          const f = inner(e);
          return f ? [summaryOf(f, k * CHUNK + i)] : [];
        });
      });
    });
  },

  async searchWord(word: string): Promise<ObjectId[]> {
    return cached(`word:${word}`, async () => {
      const catalog = await catalogObject();
      if (!catalog) return [];
      const bucket = fieldsOf(await getOne(stringEntry(idOf(catalog.words), word)));
      const b = inner(bucket?.value);
      if (!b) return [];
      const count = num(b.count);
      const entries = await multiGet(
        Array.from({ length: count }, (_, i) => u64Entry(idOf(b.ids), i)),
      );
      return entries.map((e) => String(fieldsOf(e)?.value ?? '')).filter(Boolean);
    });
  },

  async getArtwork(id) {
    return cached(`artwork:${id}`, async () => (await loadArtworks([id]))[0] ?? null);
  },

  async getArtworks(ids) {
    return loadArtworks(ids);
  },

  async artworkHistory(id, page, size) {
    const [artwork, regs] = await Promise.all([this.getArtwork(id), registries()]);
    if (!artwork) return [];
    const len = artwork.historyLen;
    const top = len - page * size;
    if (top <= 0) return [];
    const from = Math.max(0, top - size);
    const indexes = Array.from({ length: top - from }, (_, i) => top - 1 - i);
    const entries = await multiGet(indexes.map((i) => historyEntry(id, i)));
    return entries.flatMap((e, n) => {
      const h = inner(fieldsOf(e)?.value);
      if (!h) return [];
      const kind = HISTORY_KIND[num(h.kind)] ?? 'mint';
      const quantity = num(h.quantity);
      const amount = mist(h.amount);
      const ev: ChainEvent = {
        id: `${id}:${indexes[n]}`,
        at: iso(h.at),
        type: kind,
        artworkId: id,
        actor: String(h.actor),
        reference: opt<string>(h.reference) ?? undefined,
      };
      if (kind === 'sale' || kind === 'listing_created' || kind === 'listing_cancelled') {
        ev.quantity = quantity;
        if (amount > 0n) ev.amount = amount;
        if (quantity > 0 && amount > 0n) ev.pricePerFraction = amount / BigInt(quantity);
        if (kind === 'sale') ev.buyer = String(h.actor);
        else ev.seller = String(h.actor);
      } else if (kind === 'fractionalized' || kind === 'consolidated') {
        ev.totalFractions = quantity;
      } else if (kind === 'custody_reassigned') {
        ev.targetName = nameOf(regs.galleries, String(h.actor));
      } else if (kind === 'loss_declared') {
        ev.reportId = opt<string>(h.reference) ?? undefined;
      }
      return [ev];
    });
  },

  async artworkReports(id, page, size) {
    const [artwork, regs] = await Promise.all([this.getArtwork(id), registries()]);
    const log = artwork?.reportLog;
    if (!log) return [];
    const top = log.count - page * size;
    if (top <= 0) return [];
    const from = Math.max(0, top - size);
    const logObj = fieldsOf(await getOne(log.id));
    if (!logObj) return [];
    const table = idOf(logObj.entries);
    const indexes = Array.from({ length: top - from }, (_, i) => top - 1 - i);
    const refs = await multiGet(indexes.map((i) => u64Entry(table, i)));
    const reportIds = refs.map((r) => String(fieldsOf(r)?.value ?? '')).filter(Boolean);
    const reports = await multiGet(reportIds);
    return reports.flatMap((r) => {
      const f = fieldsOf(r);
      if (!f) return [];
      return [
        {
          id: idOf(f.id),
          at: iso(f.at),
          type: 'status_report' as const,
          artworkId: id,
          actor: String(f.source),
          source: String(f.source),
          sourceName: nameOf(regs.sources, String(f.source)),
          condition: CONDITIONS[num(f.condition)] ?? 'ok',
          reportId: idOf(f.id),
          readings: num(f.readings),
          attestedAt: iso(f.attested_at),
        },
      ];
    });
  },

  async listListings(artworkId) {
    return cached(`listings:${artworkId}`, async () => {
      const artwork = await this.getArtwork(artworkId);
      const vault = artwork?.fractions?.vaultId;
      if (!vault) return [];
      const ids: ObjectId[] = [];
      let cursor: string | null = null;
      do {
        const c = cursor;
        const page: SuiClientTypes.ListDynamicFieldsResponse = await withRetry(() =>
          client.listDynamicFields({ parentId: vault, cursor: c, limit: 50 }),
        );
        for (const f of page.dynamicFields) ids.push(`0x${toHex(f.name.bcs)}`);
        cursor = page.hasNextPage ? page.cursor : null;
      } while (cursor);
      return (await multiGet(ids))
        .map(listingOf)
        .filter((l): l is Listing => !!l && l.active && l.quantity > 0)
        .sort(byPrice);
    });
  },

  async getListing(id) {
    return listingOf((await multiGet([id]))[0]);
  },

  async sellerListings(seller) {
    return cached(`seller:${seller}`, async () => {
      const stats = await statsObject();
      if (!stats) return [];
      const entry = fieldsOf(
        await getOne(addressEntry(idOf(stats.open_listings_by_seller), seller)),
      );
      const ids = ((entry?.value ?? []) as string[]).map(String);
      return (await multiGet(ids)).map(listingOf).filter((l): l is Listing => !!l && l.active);
    });
  },

  async listFractions(address) {
    const out: Fraction[] = [];
    let cursor: string | null = null;
    do {
      const c = cursor;
      const page: SuiClientTypes.ListOwnedObjectsResponse<{ json: true }> = await withRetry(() =>
        client.listOwnedObjects({
          owner: address,
          type: `${PKG}::fraction::Fraction`,
          include: { json: true },
          cursor: c,
          limit: 50,
        }),
      );
      for (const o of page.objects) {
        const f = fieldsOf(o);
        if (f)
          out.push({
            id: idOf(f.id),
            vaultId: f.vault_id,
            artworkId: f.artwork_id,
            amount: num(f.amount),
          });
      }
      cursor = page.hasNextPage ? page.cursor : null;
    } while (cursor);
    return out;
  },

  async worksOf(kind: WorksOf, address) {
    return cached(`works:${kind}:${address}`, async () => {
      const catalog = await catalogObject();
      if (!catalog) return [];
      const table = idOf(
        kind === 'artist'
          ? catalog.by_artist
          : kind === 'owner'
            ? catalog.by_owner
            : kind === 'custodian'
              ? catalog.by_custodian
              : catalog.by_intended,
      );
      const entry = fieldsOf(await getOne(addressEntry(table, address)));
      return ((entry?.value ?? []) as string[]).map(String);
    });
  },

  async royaltiesOf(artist) {
    const stats = await statsObject();
    if (!stats) return 0n;
    const entry = fieldsOf(await getOne(addressEntry(idOf(stats.royalties_by_artist), artist)));
    return mist(entry?.value);
  },

  async listGalleries() {
    const { galleries } = await registries();
    return galleries.map<GalleryEntry>((g) => ({
      address: g.address,
      name: g.name,
      registeredAt: g.since,
      active: g.active,
      revokedAt: g.revokedAt,
    }));
  },

  async listSources() {
    const [{ sources }, channel] = await Promise.all([registries(), channelStatsObject()]);
    const kinds: SourceKind[] = ['inspector', 'space_sensor', 'external_system'];
    const table = channel ? idOf(channel.by_source) : '';
    const activity = table
      ? await multiGet(sources.map((s) => addressEntry(table, s.address)))
      : [];
    return sources.map<SourceEntry>((s, i) => {
      const a = inner(fieldsOf(activity[i])?.value);
      return {
        address: s.address,
        name: s.name,
        kind: kinds.includes(s.kind as SourceKind) ? (s.kind as SourceKind) : 'external_system',
        registeredAt: s.since,
        active: s.active,
        revokedAt: s.revokedAt,
        reports: num(a?.reports),
        lastReportAt: a ? iso(a.last_at) : undefined,
      };
    });
  },

  async galleryOf(address) {
    return cached(`gallery:${address}`, async () => {
      const reg = fieldsOf(await getOne(config.objects.galleryRegistry));
      if (!reg) return null;
      const v = inner(fieldsOf(await getOne(addressEntry(idOf(reg.entries), address)))?.value);
      if (!v) return null;
      const revoked = opt<string>(v.revoked_at);
      return {
        address,
        name: String(v.name),
        registeredAt: isoDate(v.since),
        active: Boolean(v.active),
        revokedAt: revoked ? isoDate(revoked) : undefined,
      };
    });
  },

  async getParams(): Promise<ProtocolParams> {
    return cached('params', async () => {
      const [params, cap, policy] = await multiGet([
        config.objects.params,
        config.objects.adminCap,
        config.objects.channelPolicy,
      ]);
      const p = fieldsOf(params);
      const w = fieldsOf(policy);
      return {
        royaltyBps: p ? num(p.royalty_bps) : 0,
        windowMs: w ? num(w.window_ms) : 60_000,
        acceptedEnclave: w ? (opt<string>(w.accepted_enclave) ?? null) : null,
        endpoint: w ? String(w.endpoint ?? '') : '',
        authority: ownerAddress(cap instanceof Error ? null : cap),
      };
    });
  },

  async govTrail(cursor) {
    const regs = await registries();
    return mergedEvents(
      [
        `${PKG}::registry`,
        `${PKG}::admin`,
        `${PKG}::report::WindowChanged`,
        `${PKG}::report::EnclaveAccepted`,
        `${PKG}::report::EnclaveCleared`,
        `${PKG}::report::EndpointChanged`,
        `${PKG}::custody::CustodyReassigned`,
      ],
      cursor,
      regs,
    );
  },

  async enclaveState() {
    const [cfg, regs] = await Promise.all([
      withRetry(() =>
        client.getObject({
          objectId: config.enclave.configId,
          include: { json: true },
        }),
      ),
      suiAdapter.enclaveRegistrations(),
    ]);
    const f = fieldsOf(cfg.object);
    const pcrs = (f?.pcrs ?? {}) as Record<string, string>;
    const version = num(f?.version);
    return {
      configId: config.enclave.configId,
      name: String(f?.name ?? ''),
      version,
      pcr0: hexOf(pcrs.pos0),
      pcr1: hexOf(pcrs.pos1),
      pcr2: hexOf(pcrs.pos2),
      current: regs.find((r) => r.configVersion === version) ?? null,
    };
  },

  // register_enclave emits no event: the registrations are the transactions that called it, per package version
  enclaveRegistrations() {
    return cached('enclaveRegs', async () => {
      const txs: {
        digest: string;
        at: string;
        sender: string;
        enclaveId: string;
      }[] = [];
      for (const pkg of PACKAGE_VERSIONS) {
        const call = client.ledgerService.listTransactions({
          filter: {
            terms: [
              {
                literals: [
                  {
                    negated: false,
                    predicate: {
                      oneofKind: 'moveCall',
                      moveCall: { function: `${pkg}::enclave::register_enclave` },
                    },
                  },
                ],
              },
            ],
          },
          readMask: {
            paths: ['digest', 'timestamp', 'transaction.sender', 'effects.changed_objects'],
          },
          options: { limit: 100 },
        });
        for await (const frame of call.responses) {
          const t = frame.transaction;
          if (!t?.digest) continue;
          const created = (t.effects?.changedObjects ?? []).find(
            (o) => String(o.objectType ?? '').includes('::enclave::Enclave<') && o.objectId,
          );
          if (!created?.objectId) continue;
          txs.push({
            digest: t.digest,
            at: iso(Number(t.timestamp?.seconds ?? 0) * 1000),
            sender: String(t.transaction?.sender ?? ''),
            enclaveId: created.objectId,
          });
        }
      }
      txs.sort((a, b) => b.at.localeCompare(a.at));
      const objects = await multiGet(txs.map((t) => t.enclaveId));
      return txs.map((t, i) => {
        const f = fieldsOf(objects[i]);
        return {
          enclaveId: t.enclaveId,
          publicKey: hexOf(f?.pk),
          owner: String(f?.owner ?? t.sender),
          configVersion: num(f?.config_version),
          at: t.at,
          txDigest: t.digest,
        };
      });
    });
  },

  async reportsFeed(cursor) {
    const regs = await registries();
    const page = await eventsPage(`${PKG}::report::ReportRecorded`, cursor, FEED_PAGE);
    const items = page.events.flatMap((e) => {
      const mapped = mapEvent(e, regs);
      return mapped ? [mapped] : [];
    });
    return {
      items,
      cursor: page.hasNextPage ? page.endCursor : null,
      more: page.hasNextPage,
    };
  },

  subscribe(listener) {
    listeners.add(listener);
    if (!poller) poller = setInterval(() => void poll(), 30_000);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0 && poller) {
        clearInterval(poller);
        poller = null;
      }
    };
  },

  watch(ids) {
    for (const id of ids) watched.set(id, (watched.get(id) ?? 0) + 1);
    return () => {
      for (const id of ids) {
        const n = (watched.get(id) ?? 1) - 1;
        if (n <= 0) watched.delete(id);
        else watched.set(id, n);
      }
    };
  },
};
