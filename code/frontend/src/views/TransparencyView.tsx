import { PageWithNav, NavPane } from '@/components/SectionNav';
import { ReportsSection } from '@/components/Channel';
import { firstLoad, useGalleries, useParams, useSources, useStats } from '@/state/queries';
import { SOURCE_KIND_LABEL } from '@/state/derive';
import { Section, LoadingState, ScrollX, Page } from '@/components/primitives';
import { GovTrailSection } from '@/components/GovTrail';
import { EnclaveSection } from '@/components/EnclaveCard';
import { Icon } from '@/components/Icon';
import { AddressLink } from '@/components/TxLink';
import { fmtBps, fmtDate, fmtInt, fmtSUI, fmtWindow } from '@/components/format';

export function TransparencyView() {
  const stats = useStats();
  const galleries = useGalleries();
  const sources = useSources();
  const params = useParams();

  if (firstLoad(stats, galleries, sources, params)) {
    return (
      <Page>
        <LoadingState />
      </Page>
    );
  }
  const s = stats.data;
  const p = params.data;

  return (
    <PageWithNav title="Διαφάνεια" sections={TRANSPARENCY_SECTIONS}>
      <Section id="stats" title="Στοιχεία αγοράς" icon="chart-line">
        <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <Figure value={fmtInt(s?.worksLive ?? 0)} label="έργα στην πλατφόρμα" />
          <Figure value={fmtInt(s?.galleriesActive ?? 0)} label="ενεργές γκαλερί" />
          <Figure value={fmtInt(s?.sourcesActive ?? 0)} label="ενεργές εξωτερικές πηγές" />
          <Figure value={fmtInt(s?.fractionsOutstanding ?? 0)} label="κλάσματα σε κυκλοφορία" />
          <Figure value={fmtInt(s?.sales ?? 0)} label="πωλήσεις κλασμάτων" />
          <Figure value={fmtSUI(s?.volumeMist ?? 0n)} label="όγκος συναλλαγών" />
          <Figure
            value={fmtSUI(s?.royaltiesMist ?? 0n)}
            label="δικαίωμα παρακολούθησης καταβλημένο"
          />
          <Figure value={fmtInt(s?.reportsTotal ?? 0)} label="αναφορές κατάστασης" />
        </dl>
        <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
          <Icon name="sliders" size={13} className="shrink-0 text-[hsl(var(--accent))]" />
          Ισχύον δικαίωμα παρακολούθησης:{' '}
          <span className="font-mono2 font-medium">
            {fmtBps(p?.royaltyBps ?? 0)} ({fmtInt(p?.royaltyBps ?? 0)} μονάδες βάσης)
          </span>
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
          <Icon name="hourglass-half" size={13} className="shrink-0 text-[hsl(var(--accent))]" />
          Παράθυρο συνάθροισης του Oracle Nautilus:{' '}
          <span className="font-mono2 font-medium">{fmtWindow(p?.windowMs ?? 60_000)}</span>
        </p>
      </Section>

      <Section id="galleries" title="Μητρώο πιστοποιημένων γκαλερί" icon="building-columns">
        <RegistryTable
          rows={(galleries.data ?? []).map((g) => ({
            key: g.address,
            address: g.address,
            name: g.name,
            registeredAt: g.registeredAt,
            active: g.active,
            revokedAt: g.revokedAt,
          }))}
        />
      </Section>

      <Section id="sources" title="Μητρώο εξωτερικών πηγών" icon="satellite-dish">
        <RegistryTable
          identity
          rows={(sources.data ?? []).map((s) => ({
            key: s.address,
            address: s.address,
            name: s.name,
            kind: SOURCE_KIND_LABEL[s.kind],
            registeredAt: s.registeredAt,
            active: s.active,
            revokedAt: s.revokedAt,
            reports: s.reports,
            lastReportAt: s.lastReportAt,
          }))}
        />
      </Section>

      <GovTrailSection id="trail" />

      <EnclaveSection id="enclave" history />

      <NavPane id="reports">
        <div className="flex flex-col gap-6">
          <ReportsSection />
        </div>
      </NavPane>
    </PageWithNav>
  );
}

const TRANSPARENCY_SECTIONS = [
  { id: 'stats', label: 'Στοιχεία αγοράς', icon: 'chart-line' },
  { id: 'galleries', label: 'Μητρώο γκαλερί', icon: 'building-columns' },
  { id: 'sources', label: 'Μητρώο πηγών', icon: 'satellite-dish' },
  { id: 'trail', label: 'Ίχνος πράξεων', icon: 'clock-rotate-left' },
  { id: 'enclave', label: 'Oracle Nautilus', icon: 'file-shield' },
  { id: 'reports', label: 'Αναφορές κατάστασης', icon: 'clipboard-list' },
] as const;

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dd className="font-display text-2xl font-semibold tracking-tight">{value}</dd>
      <dt className="mt-0.5 text-xs text-muted-foreground">{label}</dt>
    </div>
  );
}

function RegistryTable({
  rows,
  identity = false,
}: {
  identity?: boolean;
  rows: {
    key: string;
    address: string;
    name?: string;
    kind?: string;
    registeredAt?: string;
    active: boolean;
    revokedAt?: string;
    reports?: number;
    lastReportAt?: string;
  }[];
}) {
  if (rows.length === 0) {
    return <p className="text-[13px] text-muted-foreground">Καμία εγγραφή ακόμη.</p>;
  }
  const showKind = rows.some((r) => r.kind);
  const showReports = rows.some((r) => r.reports !== undefined);
  return (
    <ScrollX minWidth={identity ? '46rem' : '34rem'}>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="py-2 pr-4 font-medium">
              {identity ? 'Ταυτότητα κλειδιού' : 'Διεύθυνση'}
            </th>
            <th className="py-2 pr-4 font-medium">{identity ? 'Ονομασία' : 'Επωνυμία'}</th>
            {showKind ? <th className="py-2 pr-4 font-medium">Είδος</th> : null}
            <th className="py-2 pr-4 font-medium">Εγγραφή</th>
            {showReports ? <th className="py-2 pr-4 font-medium">Αναφορές</th> : null}
            <th className="py-2 font-medium">Κατάσταση</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-border last:border-b-0">
              <td className="py-2.5 pr-4">
                {identity ? (
                  // not a link to the explorer, so the identity is written out in full
                  <span className="block w-[15.5rem] break-all font-mono2 text-xs">
                    {r.address}
                  </span>
                ) : (
                  <AddressLink address={r.address} short />
                )}
              </td>
              <td className="py-2.5 pr-4">{r.name ?? '-'}</td>
              {showKind ? <td className="py-2.5 pr-4">{r.kind ?? '-'}</td> : null}
              <td className="whitespace-nowrap py-2.5 pr-4 font-mono2 text-xs">
                {r.registeredAt ?? '-'}
              </td>
              {showReports ? (
                <td className="whitespace-nowrap py-2.5 pr-4 font-mono2 text-xs">
                  {r.reports
                    ? `${fmtInt(r.reports)}, τελευταία ${r.lastReportAt ? fmtDate(r.lastReportAt) : ''}`
                    : '-'}
                </td>
              ) : null}
              <td className="py-2.5">
                {r.active ? (
                  <span className="inline-flex items-center gap-1 text-[hsl(var(--status-ok-fg))]">
                    <Icon name="circle-check" size={11} /> Ενεργή
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[hsl(var(--destructive))]">
                    <Icon name="circle-xmark" size={11} /> Ανακλήθηκε {r.revokedAt}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollX>
  );
}
