import {
  TERMINAL,
  type Address,
  type Artwork,
  type Fraction,
  type GalleryEntry,
  type Holding,
  type Listing,
  type Mist,
  type ProtocolParams,
  type StatusCondition,
} from '@/adapters';

export function statusLabel(c: StatusCondition): string {
  switch (c) {
    case 'ok':
      return 'Καλή κατάσταση';
    case 'damaged':
      return 'Φθορά';
    case 'destroyed':
      return 'Καταστροφή';
    case 'missing':
      return 'Αγνοείται';
  }
}

export function lifecycleTone(a: Pick<Artwork, 'lifecycle'>): string {
  switch (a.lifecycle) {
    case 'lost':
      return 'text-[hsl(var(--status-destroyed-fg))] font-medium';
    case 'redeemed':
    case 'cancelled':
      return 'text-muted-foreground';
    default:
      return '';
  }
}

export function lifecycleLabel(a: Pick<Artwork, 'lifecycle'>): string {
  switch (a.lifecycle) {
    case 'minted':
      return 'Εκδόθηκε';
    case 'in_custody':
      return 'Σε φύλαξη';
    case 'certified':
      return 'Πιστοποιημένο';
    case 'fractionalized':
      return 'Κλασματοποιημένο';
    case 'redeemed':
      return 'Εξαργυρωμένο';
    case 'lost':
      return 'Δηλώθηκε απώλεια';
    case 'cancelled':
      return 'Ακυρώθηκε από τον καλλιτέχνη';
  }
}

export function terminalTone(a: Pick<Artwork, 'lifecycle'>): 'amber' | 'red' {
  return a.lifecycle === 'redeemed' ? 'amber' : 'red';
}

export function terminalNote(a: Artwork): string {
  const closed = a.custody?.until ? ` στις ${a.custody.until}` : '';
  const name = a.custody?.galleryName || '';
  const gallery = name ? `γκαλερί ${name}` : 'γκαλερί φύλαξης';
  switch (a.lifecycle) {
    case 'redeemed':
      return `Ο ιδιοκτήτης παρέλαβε το φυσικό έργο από τη ${gallery}${closed}. Η φύλαξη έκλεισε και το ψηφιακό αντικείμενο δεν δέχεται άλλες πράξεις. Η σελίδα παραμένει ως ιστορικό.`;
    case 'lost':
      return `Η ${gallery} δήλωσε απώλεια ή καταστροφή${closed}. Το θησαυροφυλάκιο, τα κλάσματα και η καταχώριση φύλαξης διατηρούνται ως τεκμήριο.`;
    case 'cancelled':
      return 'Ο καλλιτέχνης ακύρωσε την έκδοση πριν από την παραλαβή σε φύλαξη. Το αντικείμενο παραμένει στην αλυσίδα ως ακυρωμένο.';
    default:
      return '';
  }
}

export function isTerminal(a: Pick<Artwork, 'lifecycle'>): boolean {
  return TERMINAL.includes(a.lifecycle);
}

export function isLost(a: Pick<Artwork, 'lifecycle'>): boolean {
  return a.lifecycle === 'lost';
}

export function needsAttention(a: Artwork): Artwork['lastReport'] {
  if (isTerminal(a)) return null;
  const last = a.lastReport;
  return last && last.condition !== 'ok' ? last : null;
}

export function pendingIntakes(intended: Artwork[]): Artwork[] {
  return intended
    .filter((a) => !isTerminal(a))
    .sort((a, b) => a.mintedAt.localeCompare(b.mintedAt));
}

export function orphanedCustody(works: Artwork[], galleries: GalleryEntry[]): Artwork[] {
  const active = new Set(galleries.filter((g) => g.active).map((g) => g.address));
  return works.filter(
    (a) =>
      !isTerminal(a) &&
      a.custody &&
      !a.custody.until &&
      !active.has(a.custody.gallery) &&
      (!a.intendedGallery ||
        (!!a.intendedGallery.byAuthority && !active.has(a.intendedGallery.gallery))),
  );
}

export function aggregateHoldings(fractions: Fraction[]): Holding[] {
  const byVault = new Map<string, Holding>();
  for (const f of fractions) {
    const existing = byVault.get(f.vaultId);
    if (existing) {
      existing.amount += f.amount;
      existing.fractionIds.push(f.id);
    } else {
      byVault.set(f.vaultId, {
        artworkId: f.artworkId,
        vaultId: f.vaultId,
        amount: f.amount,
        fractionIds: [f.id],
      });
    }
  }
  return [...byVault.values()].filter((h) => h.amount > 0);
}

export type NoticeKind = 'intake' | 'redemption' | 'report' | 'orphan' | 'mint-blocked';

export interface Notice {
  id: string;
  kind: NoticeKind;
  title: string;
  detail: string;
  artworkId: string;
  to: string;
  at: string;
}

export function notices(input: {
  address: Address | null;
  isGallery: boolean;
  isAuthority: boolean;
  intended: Artwork[];
  custody: Artwork[];
  issued: Artwork[];
  owned: Artwork[];
  held: Artwork[];
  orphans: Artwork[];
  galleries: GalleryEntry[];
}): Notice[] {
  const { address } = input;
  if (!address) return [];
  const out: Notice[] = [];
  const active = new Set(input.galleries.filter((g) => g.active).map((g) => g.address));

  if (input.isGallery) {
    for (const a of pendingIntakes(input.intended))
      out.push({
        id: `intake-${a.id}`,
        kind: 'intake',
        title: a.title,
        artworkId: a.id,
        detail: 'αναμένει καταχώριση παραλαβής',
        to: '/gallery#attention',
        at: a.mintedAt,
      });
    for (const a of pendingRedemptions(input.custody))
      out.push({
        id: `redemption-${a.id}`,
        kind: 'redemption',
        title: a.title,
        artworkId: a.id,
        detail: 'αίτημα εξαργύρωσης προς επιβεβαίωση',
        to: '/gallery#attention',
        at: a.redemption!.at,
      });
    for (const a of input.custody) {
      const r = needsAttention(a);
      if (r)
        out.push({
          id: `report-${r.id}`,
          kind: 'report',
          title: a.title,
          artworkId: a.id,
          detail: `αναφορά προβλήματος: ${statusLabel(r.condition).toLowerCase()}`,
          to: '/gallery#attention',
          at: r.at,
        });
    }
  } else if (input.isAuthority) {
    for (const a of orphanedCustody(input.orphans, input.galleries))
      out.push({
        id: `orphan-${a.id}`,
        kind: 'orphan',
        title: a.title,
        artworkId: a.id,
        detail: 'χωρίς ενεργή γκαλερί φύλαξης, ορίστε νέα',
        to: '/admin#custody',
        at: a.mintedAt,
      });
  } else {
    for (const a of input.held) {
      const r = needsAttention(a);
      if (r)
        out.push({
          id: `report-${r.id}`,
          kind: 'report',
          title: a.title,
          artworkId: a.id,
          detail: `αναφορά προβλήματος: ${statusLabel(r.condition).toLowerCase()}`,
          to: '/portfolio#notifications',
          at: r.at,
        });
    }
    const mine = new Map<string, Artwork>();
    for (const a of [...input.issued, ...input.owned]) mine.set(a.id, a);
    for (const a of mine.values()) {
      if (isTerminal(a)) continue;
      if (
        a.artist === address &&
        a.lifecycle === 'minted' &&
        a.intendedGallery &&
        !active.has(a.intendedGallery.gallery)
      )
        out.push({
          id: `blocked-${a.id}`,
          kind: 'mint-blocked',
          title: a.title,
          artworkId: a.id,
          detail: 'η γκαλερί παραλαβής ανακλήθηκε, ακυρώστε την έκδοση',
          to: '/portfolio#works',
          at: a.mintedAt,
        });
      if (a.owner === address && a.custody && !a.custody.until && !active.has(a.custody.gallery))
        out.push({
          id: `custodian-${a.id}`,
          kind: 'orphan',
          title: a.title,
          artworkId: a.id,
          detail: 'η γκαλερί φύλαξης ανακλήθηκε από το μητρώο',
          to: '/portfolio#notifications',
          at: a.custody.since,
        });
    }
  }
  const seen = new Set<string>();
  return out
    .filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true)))
    .sort((x, y) => y.at.localeCompare(x.at));
}

export function activeListings(listings: Listing[]): Listing[] {
  return listings.filter((l) => l.active && l.quantity > 0);
}

export function isGallery(galleries: GalleryEntry[], address: Address | null): GalleryEntry | null {
  if (!address) return null;
  return galleries.find((g) => g.address === address && g.active) ?? null;
}

// The same integer arithmetic as market::royalty_of; a primary sale pays no royalty
export function paymentSplit(
  total: Mist,
  params: ProtocolParams,
  opts: { primary?: boolean } = {},
): {
  sellerAmount: Mist;
  royaltyAmount: Mist;
  total: Mist;
  primary: boolean;
} {
  const primary = opts.primary ?? false;
  const royaltyAmount = primary ? 0n : (total * BigInt(params.royaltyBps)) / 10_000n;
  return { sellerAmount: total - royaltyAmount, royaltyAmount, total, primary };
}

export function isPrimarySale(artwork: Artwork | null | undefined, seller: Address): boolean {
  return !!artwork && artwork.artist === seller;
}

export function galleryWorks(custody: Artwork[], gallery: Address): Artwork[] {
  return custody.filter((a) => a.custody?.gallery === gallery && !a.custody.until);
}

export function pendingRedemptions(custody: Artwork[]): Artwork[] {
  return custody
    .filter((a) => !!a.redemption && !isTerminal(a) && !!a.custody && !a.custody.until)
    .sort((a, b) => (a.redemption!.at ?? '').localeCompare(b.redemption!.at ?? ''));
}

export const SOURCE_KIND_LABEL: Record<string, string> = {
  inspector: 'Επιθεωρητής',
  space_sensor: 'Αισθητήρας χώρου',
  external_system: 'Εξωτερικό σύστημα',
};

export function isSuiAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}
