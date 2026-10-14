export type Address = string;
export type ObjectId = string;
export type TxDigest = string;

export type Mist = bigint;
export const MIST_PER_SUI = 1_000_000_000n;

export type StatusCondition = 'ok' | 'damaged' | 'destroyed' | 'missing';

export type Lifecycle =
  | 'minted' // εκδόθηκε, δεν έχει παραληφθεί
  | 'in_custody' // σε φύλαξη
  | 'certified' // πιστοποιημένο
  | 'fractionalized' // κλασματοποιημένο
  | 'redeemed' // εξαργυρωμένο (terminal)
  | 'lost' // δηλώθηκε απώλεια, το έργο ακυρώθηκε (terminal)
  | 'cancelled'; // ο καλλιτέχνης ακύρωσε την έκδοση πριν την παράδοση (terminal)

export const TERMINAL: readonly Lifecycle[] = ['redeemed', 'lost', 'cancelled'];

export interface Certificate {
  issuer: Address;
  issuerName: string;
  issuedAt: string; // ISO date
  statement: string;
  documentationBlobId?: string;
}

export interface Custody {
  gallery: Address;
  galleryName: string;
  since: string;
  until?: string;
}

export interface MarketStats {
  supply: number;
  openListings: number;
  trades: number;
  volumeMist: Mist;
  lastPrice: Mist | null;
}

export interface ReportLog {
  id: ObjectId;
  count: number;
  notOk: number;
  last: { id: ObjectId; condition: StatusCondition; at: string } | null;
}

export interface Artwork {
  id: ObjectId;
  title: string;
  artist: Address;
  artistName: string;
  year: string;
  medium: string;
  dimensions: string;
  description: string;
  image: string;
  imageBlobId: string;
  hiresBlobId: string;
  sealSalt: string;
  storage: ObjectId[]; // SharedBlob object ids behind the files, empty for older artworks
  mintedAt: string;
  owner: Address | null;
  lifecycle: Lifecycle;
  custody: Custody | null;
  intendedGallery: (Custody & { byAuthority?: boolean }) | null;
  certificate: Certificate | null;
  fractions: { vaultId: ObjectId; total: number } | null;
  redemption: RedemptionRequest | null;
  market: MarketStats;
  historyLen: number;
  reportLog: ReportLog | null;
  lastReport: { id: ObjectId; condition: StatusCondition; at: string } | null;
}

export interface RedemptionRequest {
  requestedBy: Address;
  at: string;
  note: string;
}

export interface CatalogSummary {
  id: ObjectId;
  position: number;
  title: string;
  artistName: string;
  artist: Address;
  year: string;
  medium: string;
  image: string;
  imageBlobId: string;
  mintedAt: string;
  lifecycle: Lifecycle;
  custodian: Address | null;
  lastActivityAt: string;
}

export interface PlatformStats {
  worksLive: number;
  worksTotal: number;
  galleriesActive: number;
  sourcesActive: number;
  fractionsOutstanding: number;
  vaultsOpen: number;
  sales: number;
  volumeMist: Mist;
  royaltiesMist: Mist;
  openListings: number;
  reportsTotal: number;
}

export type ChainEventType =
  | 'mint'
  | 'custody_intake'
  | 'custody_reassigned'
  | 'certificate_issued'
  | 'fractionalized'
  | 'listing_created'
  | 'listing_cancelled'
  | 'sale'
  | 'status_report'
  | 'loss_declared'
  | 'mint_cancelled'
  | 'redeem_requested'
  | 'redeem_withdrawn'
  | 'redeemed'
  | 'gallery_registered'
  | 'gallery_revoked'
  | 'source_registered'
  | 'source_revoked'
  | 'royalty_updated'
  | 'window_updated'
  | 'enclave_accepted'
  | 'enclave_cleared'
  | 'endpoint_updated'
  | 'consolidated';

export interface ChainEvent {
  id: string;
  at: string;
  type: ChainEventType;
  artworkId?: ObjectId;
  actor?: Address;
  condition?: StatusCondition;
  source?: Address;
  sourceName?: string;
  readings?: number;
  attestedAt?: string;
  quantity?: number;
  pricePerFraction?: Mist;
  amount?: Mist;
  sellerAmount?: Mist;
  royaltyAmount?: Mist;
  buyer?: Address;
  seller?: Address;
  reference?: ObjectId;
  reportId?: ObjectId;
  reason?: string;
  totalFractions?: number;
  target?: Address;
  targetName?: string;
  oldValue?: number;
  newValue?: number;
  oldText?: string;
  newText?: string;
  note?: string;
  txDigest?: TxDigest;
}

export interface EnclaveRegistration {
  enclaveId: ObjectId;
  publicKey: string;
  owner: Address;
  configVersion: number;
  at: string;
  txDigest: TxDigest;
}

export interface EnclaveState {
  configId: ObjectId;
  name: string;
  version: number;
  pcr0: string;
  pcr1: string;
  pcr2: string;
  current: EnclaveRegistration | null;
}

export interface Page<T> {
  items: T[];
  cursor: string | null;
  more: boolean;
}

export interface Listing {
  id: ObjectId;
  artworkId: ObjectId;
  vaultId: ObjectId;
  seller: Address;
  quantity: number;
  pricePerFraction: Mist;
  active: boolean;
}

export interface Fraction {
  id: ObjectId;
  vaultId: ObjectId;
  artworkId: ObjectId;
  amount: number;
}

export interface Holding {
  artworkId: ObjectId;
  vaultId: ObjectId;
  amount: number;
  fractionIds: ObjectId[];
}

export interface GalleryEntry {
  address: Address;
  name: string;
  registeredAt: string;
  active: boolean;
  revokedAt?: string;
}

export type SourceKind = 'inspector' | 'space_sensor' | 'external_system';

export interface SourceEntry {
  address: Address;
  name: string;
  kind: SourceKind;
  registeredAt: string;
  active: boolean;
  revokedAt?: string;
  reports: number;
  lastReportAt?: string;
}

export interface ProtocolParams {
  royaltyBps: number;
  windowMs: number;
  acceptedEnclave: ObjectId | null;
  endpoint: string;
  authority: Address | null;
}

export type WorksOf = 'artist' | 'owner' | 'custodian' | 'intended';

export interface ChainAdapter {
  getStats(): Promise<PlatformStats>;
  catalogIndex(): Promise<CatalogSummary[]>;
  searchWord(word: string): Promise<ObjectId[]>;
  getArtwork(id: ObjectId): Promise<Artwork | null>;
  getArtworks(ids: ObjectId[]): Promise<Artwork[]>;
  artworkHistory(id: ObjectId, page: number, size: number): Promise<ChainEvent[]>;
  artworkReports(id: ObjectId, page: number, size: number): Promise<ChainEvent[]>;
  listListings(artworkId: ObjectId): Promise<Listing[]>;
  getListing(id: ObjectId): Promise<Listing | null>;
  sellerListings(seller: Address): Promise<Listing[]>;
  listFractions(address: Address): Promise<Fraction[]>;
  worksOf(kind: WorksOf, address: Address): Promise<ObjectId[]>;
  royaltiesOf(artist: Address): Promise<Mist>;
  listGalleries(): Promise<GalleryEntry[]>;
  listSources(): Promise<SourceEntry[]>;
  galleryOf(address: Address): Promise<GalleryEntry | null>;
  getParams(): Promise<ProtocolParams>;
  govTrail(cursor: string | null): Promise<Page<ChainEvent>>;
  reportsFeed(cursor: string | null): Promise<Page<ChainEvent>>;
  enclaveState(): Promise<EnclaveState>;
  enclaveRegistrations(): Promise<EnclaveRegistration[]>;
  subscribe(listener: () => void): () => void;
  watch(ids: ObjectId[]): () => void;
}

export function shortId(id: string, head = 4, tail = 2): string {
  if (id.length <= head + tail + 3) return id;
  return `${id.slice(0, head + 2)}…${id.slice(-tail)}`;
}
