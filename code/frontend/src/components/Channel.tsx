import { useMemo } from 'react';
import { Link } from 'react-router';
import { chain } from '@/adapters';
import { shortId } from '@/adapters/types';
import { useFeed, useIndex } from '@/state/queries';
import { Section, EmptyState, LoadingState, MoreButton, ScrollX } from '@/components/primitives';
import { StatusBadge } from '@/components/StatusBadge';
import { TxLink } from '@/components/TxLink';
import { fmtDate } from '@/components/format';

export function ReportsSection() {
  const feed = useFeed('reports', (cursor) => chain.reportsFeed(cursor));
  const index = useIndex();
  const titles = useMemo(
    () => new Map((index.data ?? []).map((s) => [s.id, s.title])),
    [index.data],
  );

  return (
    <Section id="reports" title="Καταγεγραμμένες αναφορές κατάστασης" icon="clipboard-list">
      {feed.loading && feed.items.length === 0 ? (
        <LoadingState />
      ) : feed.items.length === 0 ? (
        <EmptyState
          title="Καμία αναφορά ακόμη"
          hint="Οι αναφορές εμφανίζονται εδώ μόλις το Oracle Nautilus κλείσει ένα παράθυρο αναγνώσεων και καταγράψει το αποτέλεσμα. Ο κόμβος κρατά περιορισμένο ιστορικό events, οπότε παλαιότερες αναφορές μπορεί να λείπουν."
        />
      ) : (
        <ScrollX minWidth="42rem">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Καταγραφή</th>
                <th className="py-2 pr-4 font-medium">Έργο</th>
                <th className="py-2 pr-4 font-medium">Πηγή</th>
                <th className="py-2 pr-4 font-medium">Κατάσταση</th>
                <th className="py-2 pr-4 font-medium">Ενδείξεις</th>
                <th className="py-2 text-right font-medium">Συναλλαγή</th>
              </tr>
            </thead>
            <tbody>
              {feed.items.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-b-0 align-top">
                  <td className="whitespace-nowrap py-2.5 pr-4 font-mono2 text-xs text-muted-foreground">
                    {fmtDate(e.at)}
                  </td>
                  <td className="py-2.5 pr-4">
                    <Link to={`/artwork/${e.artworkId}`} className="font-medium hover:underline">
                      {titles.get(e.artworkId ?? '') ?? shortId(e.artworkId ?? '', 8, 6)}
                    </Link>
                  </td>
                  <td className="py-2.5 pr-4" title={e.source}>
                    {e.sourceName || 'άγνωστη πηγή'}
                  </td>
                  <td className="py-2.5 pr-4">
                    {e.condition ? <StatusBadge condition={e.condition} /> : null}
                  </td>
                  <td className="py-2.5 pr-4 font-mono2 text-xs text-muted-foreground">
                    {e.readings ?? ''}
                  </td>
                  <td className="whitespace-nowrap py-2.5 text-right">
                    {e.txDigest ? <TxLink digest={e.txDigest} /> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollX>
      )}
      <MoreButton
        remaining={feed.more ? 1 : 0}
        label="Περισσότερες"
        onMore={feed.loadMore}
        countKnown={false}
      />
    </Section>
  );
}
