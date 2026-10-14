import { useMemo } from 'react';
import { chain } from '@/adapters';
import type {
  Artwork,
  CatalogSummary,
  ChainEvent,
  EnclaveRegistration,
  EnclaveState,
  Fraction,
  GalleryEntry,
  Holding,
  Listing,
  Mist,
  PlatformStats,
  ProtocolParams,
  SourceEntry,
  WorksOf,
} from '@/adapters';
import { useWallet } from '@/adapters/wallet-context';
import {
  ownedBlobs,
  sharedBlobs,
  walrusEpoch,
  type StoredBlob,
  type WalrusEpoch,
} from '@/adapters/walrusStorage';
import { config } from '@/config';
import { aggregateHoldings, notices, type Notice } from './derive';
import { firstLoad, useFeed, useRead, useWatch, type ReadState } from './store';

export { useFeed, useWatch, firstLoad };
export type { ReadState };

const EMPTY_IDS: string[] = [];
const EMPTY_ARTWORKS: Artwork[] = [];
const EMPTY_FRACTIONS: Fraction[] = [];
const EMPTY_LISTINGS: Listing[] = [];
const EMPTY_BLOBS: StoredBlob[] = [];

export function useStats(): ReadState<PlatformStats> {
  return useRead('stats', () => chain.getStats());
}

export function useIndex(): ReadState<CatalogSummary[]> {
  return useRead('index', () => chain.catalogIndex());
}

export function useSearch(words: readonly string[]): ReadState<string[]> {
  const key = words.length ? `search:${words.join('+')}` : null;
  const r = useRead(key, async () => {
    const lists = await Promise.all(words.map((w) => chain.searchWord(w)));
    return lists.reduce((acc, ids) => acc.filter((id) => ids.includes(id)));
  });
  return key ? r : { data: EMPTY_IDS, loading: false, error: false };
}

export function useArtwork(id: string | undefined): ReadState<Artwork | null> {
  useWatch(id ? [id] : EMPTY_IDS);
  return useRead(id ? `artwork:${id}` : null, () => chain.getArtwork(id!));
}

export function useArtworks(ids: readonly string[]): ReadState<Artwork[]> {
  const key = ids.length ? `artworks:${ids.join(',')}` : null;
  const r = useRead(key, () => chain.getArtworks([...ids]));
  return key ? r : { data: EMPTY_ARTWORKS, loading: false, error: false };
}

export function useHistory(
  id: string | undefined,
  page: number,
  size: number,
): ReadState<ChainEvent[]> {
  return useRead(id ? `history:${id}:${page}:${size}` : null, () =>
    chain.artworkHistory(id!, page, size),
  );
}

export function useReports(
  id: string | undefined,
  page: number,
  size: number,
): ReadState<ChainEvent[]> {
  return useRead(id ? `reports:${id}:${page}:${size}` : null, () =>
    chain.artworkReports(id!, page, size),
  );
}

export function useListings(artworkId: string | undefined): ReadState<Listing[]> {
  const r = useRead(artworkId ? `listings:${artworkId}` : null, () =>
    chain.listListings(artworkId!),
  );
  return artworkId ? r : { data: EMPTY_LISTINGS, loading: false, error: false };
}

export function useSellerListings(address: string | null): ReadState<Listing[]> {
  const r = useRead(address ? `seller:${address}` : null, () => chain.sellerListings(address!));
  return address ? r : { data: EMPTY_LISTINGS, loading: false, error: false };
}

export function useFractions(address: string | null): Fraction[] {
  const r = useRead(address ? `fractions:${address}` : null, () => chain.listFractions(address!));
  return r.data ?? EMPTY_FRACTIONS;
}

export function useHoldings(address: string | null): Holding[] {
  const fractions = useFractions(address);
  return useMemo(() => aggregateHoldings(fractions), [fractions]);
}

export function useHoldingFor(
  address: string | null,
  artworkId: string | undefined,
): Holding | null {
  const holdings = useHoldings(address);
  return useMemo(
    () => holdings.find((h) => h.artworkId === artworkId) ?? null,
    [holdings, artworkId],
  );
}

export function useWorks(kind: WorksOf, address: string | null): ReadState<Artwork[]> {
  const r = useRead(address ? `works:${kind}:${address}` : null, async () => {
    const ids = await chain.worksOf(kind, address!);
    return chain.getArtworks(ids);
  });
  return address ? r : { data: EMPTY_ARTWORKS, loading: false, error: false };
}

export function useHeldWorks(address: string | null): ReadState<Artwork[]> {
  const holdings = useHoldings(address);
  const ids = useMemo(() => holdings.map((h) => h.artworkId).sort(), [holdings]);
  return useArtworks(ids);
}

export function useRoyaltiesOf(address: string | null): ReadState<Mist> {
  return useRead(address ? `royalties:${address}` : null, () => chain.royaltiesOf(address!));
}

export function useGalleries(): ReadState<GalleryEntry[]> {
  return useRead('galleries', () => chain.listGalleries());
}

export function useSources(): ReadState<SourceEntry[]> {
  return useRead('sources', () => chain.listSources());
}

export function useEnclave(): ReadState<EnclaveState> {
  return useRead('enclave', () => chain.enclaveState());
}

export function useEnclaveRegistrations(): ReadState<EnclaveRegistration[]> {
  return useRead('enclave:registrations', () => chain.enclaveRegistrations());
}

export function useParams(): ReadState<ProtocolParams> {
  return useRead('params', () => chain.getParams());
}

export const NO_PARAMS: ProtocolParams = {
  royaltyBps: 0,
  windowMs: 60_000,
  authority: null,
  acceptedEnclave: null,
  endpoint: '',
};

export function useRole() {
  const { address } = useWallet();
  const entry = useRead(address ? `gallery:${address}` : null, () => chain.galleryOf(address!));
  const params = useParams();
  return useMemo(() => {
    const gallery = entry.data && entry.data.active ? entry.data : null;
    const authority = (params.data ?? NO_PARAMS).authority ?? config.authority;
    return {
      address,
      connected: !!address,
      gallery,
      isGallery: !!gallery,
      isAuthority: !!address && address === authority,
      loading: !!address && (entry.loading || params.loading),
    };
  }, [address, entry.data, entry.loading, params.data, params.loading]);
}

export function useNotices(): Notice[] {
  const role = useRole();
  const gallery = role.isGallery ? role.address : null;
  const personal = role.connected && !role.isGallery && !role.isAuthority ? role.address : null;
  const intended = useWorks('intended', gallery);
  const custody = useWorks('custodian', gallery);
  const issued = useWorks('artist', personal);
  const owned = useWorks('owner', personal);
  const held = useHeldWorks(personal);
  const galleries = useGalleries();
  const orphans = useOrphans(role.isAuthority);
  return useMemo(
    () =>
      notices({
        address: role.address,
        isGallery: role.isGallery,
        isAuthority: role.isAuthority,
        intended: intended.data ?? EMPTY_ARTWORKS,
        custody: custody.data ?? EMPTY_ARTWORKS,
        issued: issued.data ?? EMPTY_ARTWORKS,
        owned: owned.data ?? EMPTY_ARTWORKS,
        held: held.data ?? EMPTY_ARTWORKS,
        orphans: orphans.data ?? EMPTY_ARTWORKS,
        galleries: galleries.data ?? [],
      }),
    [
      role.address,
      role.isGallery,
      role.isAuthority,
      intended.data,
      custody.data,
      issued.data,
      owned.data,
      held.data,
      orphans.data,
      galleries.data,
    ],
  );
}

export function useWalrusEpoch(): ReadState<WalrusEpoch> {
  return useRead('walrus:epoch', () => walrusEpoch());
}

export function useSharedBlobs(ids: readonly string[]): ReadState<StoredBlob[]> {
  const key = ids.length ? `walrus:shared:${ids.join(',')}` : null;
  const r = useRead(key, () => sharedBlobs(ids));
  return key ? r : { data: EMPTY_BLOBS, loading: false, error: false };
}

export function useOwnedBlobs(owner: string | null): ReadState<StoredBlob[]> {
  const r = useRead(owner ? `walrus:owned:${owner}` : null, () => ownedBlobs(owner!));
  return owner ? r : { data: EMPTY_BLOBS, loading: false, error: false };
}

export function useOrphans(enabled: boolean): ReadState<Artwork[]> {
  const r = useRead(enabled ? 'orphans' : null, async () => {
    const galleries = await chain.listGalleries();
    const revoked = galleries.filter((g) => !g.active);
    const lists = await Promise.all(revoked.map((g) => chain.worksOf('custodian', g.address)));
    return chain.getArtworks([...new Set(lists.flat())]);
  });
  return enabled ? r : { data: EMPTY_ARTWORKS, loading: false, error: false };
}

export function useRedirected(enabled: boolean): ReadState<Artwork[]> {
  const r = useRead(enabled ? 'redirected' : null, async () => {
    const galleries = await chain.listGalleries();
    const active = galleries.filter((g) => g.active);
    const lists = await Promise.all(active.map((g) => chain.worksOf('intended', g.address)));
    const works = await chain.getArtworks([...new Set(lists.flat())]);
    return works.filter((a) => a.intendedGallery?.byAuthority);
  });
  return enabled ? r : { data: EMPTY_ARTWORKS, loading: false, error: false };
}
