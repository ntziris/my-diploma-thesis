import { useId, useMemo, useState } from 'react';
import {
  NO_PARAMS,
  useArtworks,
  useIndex,
  useListings,
  useParams,
  useSearch,
} from '@/state/queries';
import { isTerminal } from '@/state/derive';
import type { Artwork, CatalogSummary, Lifecycle } from '@/adapters';
import { keywordsOf } from '@/lib/keywords';
import { ArtworkCard } from '@/components/ArtworkCard';
import { BuyModal } from '@/components/TradeModal';
import { EmptyState, LoadingState, Page } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { Button } from '@/components/Button';

const PAGE_SIZE = 6;

const IN_CUSTODY: Lifecycle[] = ['in_custody', 'certified', 'fractionalized'];
const CERTIFIED: Lifecycle[] = ['certified', 'fractionalized'];

const STATUS_OPTIONS: { value: string; label: string; match: (s: CatalogSummary) => boolean }[] = [
  { value: 'all', label: 'Ενεργά', match: (s) => !isTerminal(s) },
  { value: 'minted', label: 'Εκδόθηκε, αναμένει παραλαβή', match: (s) => s.lifecycle === 'minted' },
  { value: 'in_custody', label: 'Σε φύλαξη', match: (s) => IN_CUSTODY.includes(s.lifecycle) },
  { value: 'certified', label: 'Πιστοποιημένο', match: (s) => CERTIFIED.includes(s.lifecycle) },
  {
    value: 'fractionalized',
    label: 'Κλασματοποιημένο',
    match: (s) => s.lifecycle === 'fractionalized',
  },
  { value: 'lost', label: 'Δηλώθηκε απώλεια', match: (s) => s.lifecycle === 'lost' },
  { value: 'redeemed', label: 'Εξαργυρωμένο', match: (s) => s.lifecycle === 'redeemed' },
  { value: 'cancelled', label: 'Ακυρώθηκε', match: (s) => s.lifecycle === 'cancelled' },
  { value: 'everything', label: 'Όλα, και τα κλειστά', match: () => true },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Νεότερα' },
  { value: 'activity', label: 'Πρόσφατη δραστηριότητα' },
  { value: 'title', label: 'Τίτλος' },
];

export function CatalogueView() {
  const index = useIndex();
  const params = useParams();
  const [input, setInput] = useState('');
  const [words, setWords] = useState<string[]>([]);
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [buyFor, setBuyFor] = useState<Artwork | null>(null);
  const searchId = useId();
  const search = useSearch(words);
  const buyListings = useListings(buyFor?.id);

  const filtered = useMemo(() => {
    const match = (STATUS_OPTIONS.find((o) => o.value === status) ?? STATUS_OPTIONS[0]).match;
    const hits = words.length ? new Set(search.data ?? []) : null;
    let list = (index.data ?? []).filter((s) => match(s) && (!hits || hits.has(s.id)));
    if (sort === 'title') list = [...list].sort((a, b) => a.title.localeCompare(b.title, 'el'));
    else if (sort === 'activity')
      list = [...list].sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
    else list = [...list].sort((a, b) => b.position - a.position);
    return list;
  }, [index.data, search.data, words, status, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const sliceIds = useMemo(
    () => filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE).map((s) => s.id),
    [filtered, current],
  );
  const slice = useArtworks(sliceIds);
  const loading =
    index.loading || (words.length > 0 && search.loading) || (sliceIds.length > 0 && slice.loading);

  return (
    <Page title="Κατάλογος έργων">
      <div className="mb-6 flex flex-wrap items-center gap-3 border border-border bg-card px-4 py-3">
        <form
          className="flex min-w-[16rem] flex-1 items-center gap-2 text-[13px]"
          onSubmit={(e) => {
            e.preventDefault();
            setWords(keywordsOf(input));
            setPage(1);
          }}
        >
          <label htmlFor={searchId} className="shrink-0 text-muted-foreground">
            Αναζήτηση:
          </label>
          <input
            id={searchId}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (!e.target.value.trim() && words.length) {
                setWords([]);
                setPage(1);
              }
            }}
            placeholder="τίτλος, καλλιτέχνης, χρονιά, μέσο"
            className="w-full min-w-0 flex-1 border-b border-input bg-transparent px-1 py-1 outline-none placeholder:text-muted-foreground/60 focus:border-[hsl(var(--accent))]"
          />
          <Button
            type="submit"
            variant="outline"
            size="xs"
            icon="magnifying-glass"
            className="shrink-0"
          >
            Αναζήτηση
          </Button>
        </form>
        <label className="flex items-center gap-2 text-[13px]">
          <span className="text-muted-foreground">Κατάσταση:</span>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="border border-input bg-card px-2 py-1 outline-none focus:border-[hsl(var(--accent))]"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-[13px]">
          <span className="text-muted-foreground">Ταξινόμηση:</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="border border-input bg-card px-2 py-1 outline-none focus:border-[hsl(var(--accent))]"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {words.length ? (
        <p className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Icon name="circle-info" size={12} className="shrink-0" />
          Λέξεις-κλειδιά από το ευρετήριο της αλυσίδας:
          {words.map((w) => (
            <span key={w} className="border border-border bg-card px-1.5 py-0.5 font-mono2">
              {w}
            </span>
          ))}
          <span>({fmtCount(filtered.length)})</span>
        </p>
      ) : null}

      {loading ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Δεν βρέθηκαν έργα"
          hint="Δοκιμάστε διαφορετικές λέξεις-κλειδιά ή αλλάξτε το φίλτρο κατάστασης. Κάθε έργο που εκδίδεται στην πλατφόρμα εμφανίζεται εδώ μόλις επιβεβαιωθεί η συναλλαγή έκδοσης."
        />
      ) : (
        <div className="stagger-enter grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {(slice.data ?? []).map((a) => (
            <ArtworkCard
              key={a.id}
              artwork={a}
              terminal={isTerminal(a)}
              condition={a.lastReport?.condition ?? null}
              onBuy={params.data ? setBuyFor : undefined}
            />
          ))}
        </div>
      )}

      {pages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-4 text-[13px]">
          <Button
            disabled={current <= 1}
            onClick={() => setPage(current - 1)}
            variant="neutral"
            size="xs"
          >
            ‹ Προηγούμενα
          </Button>
          <span className="text-muted-foreground">
            Σελίδα {current} / {pages}
          </span>
          <Button
            disabled={current >= pages}
            onClick={() => setPage(current + 1)}
            variant="neutral"
            size="xs"
          >
            Επόμενα ›
          </Button>
        </div>
      )}

      <BuyModal
        artwork={buyFor}
        listings={buyListings.data ?? []}
        params={params.data ?? NO_PARAMS}
        open={!!buyFor}
        onClose={() => setBuyFor(null)}
      />
    </Page>
  );
}

function fmtCount(n: number): string {
  return n === 1 ? '1 έργο' : `${n} έργα`;
}
