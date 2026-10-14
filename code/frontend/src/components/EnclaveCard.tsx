import { useEffect, useState } from 'react';
import { useEnclave, useEnclaveRegistrations, useParams, useSources } from '@/state/queries';
import { Section, LoadingState, InfoNote, ScrollX } from '@/components/primitives';
import { AddressLink, ObjectLink, TxLink } from '@/components/TxLink';
import { Icon, type IconName } from '@/components/Icon';
import { fmtAgo, fmtDate, fmtDateTime, fmtInt, fmtWindow } from '@/components/format';
import { shortId } from '@/adapters/types';
import { Button } from './Button';

export function EnclaveSection({
  id,
  note,
  history,
  onAccept,
}: {
  id: string;
  note?: string;
  history?: boolean;
  onAccept?: (enclaveId: string) => void;
}) {
  const state = useEnclave();
  const regs = useEnclaveRegistrations();
  const params = useParams();
  const accepted = params.data?.acceptedEnclave ?? null;
  const e = state.data;
  // The accepted enclave and the registrations newer than it, the candidates; older ones are a count
  const all = regs.data ?? [];
  const acceptedIndex = all.findIndex((r) => r.enclaveId === accepted);
  const shown = acceptedIndex >= 0 ? all.slice(0, acceptedIndex + 1) : all;
  const older = all.length - shown.length;
  return (
    <Section id={id} title="Oracle Nautilus" icon="file-shield" note={note}>
      {state.loading ? (
        <LoadingState />
      ) : !e ? (
        <InfoNote>Η ρύθμιση του καναλιού δεν διαβάστηκε από την αλυσίδα.</InfoNote>
      ) : (
        <dl className="grid grid-cols-[8rem_1fr] items-start gap-y-2.5 sm:grid-cols-[11rem_1fr] text-[13px]">
          <dt className="text-muted-foreground">Ρύθμιση καναλιού</dt>
          <dd className="flex flex-wrap items-center gap-x-3">
            <ObjectLink id={e.configId} />
            <span className="text-xs text-muted-foreground">έκδοση {e.version}</span>
          </dd>
          <dt className="text-muted-foreground">Δηλωμένα PCR0 = PCR1</dt>
          <dd className="break-all font-mono2 text-xs">{e.pcr0 || 'δεν έχουν δηλωθεί'}</dd>
          <dt className="text-muted-foreground">PCR2</dt>
          <dd className="break-all font-mono2 text-xs">{e.pcr2}</dd>
          <dt className="text-muted-foreground">Σημείο εισόδου</dt>
          <dd className="break-all font-mono2 text-xs">
            {params.data?.endpoint ? (
              params.data.endpoint
            ) : (
              <span className="font-sans text-muted-foreground">δεν έχει δημοσιευτεί</span>
            )}
          </dd>
          <dt className="text-muted-foreground">Αποδεκτό Oracle Nautilus</dt>
          <dd className="flex flex-wrap items-center gap-x-3">
            {accepted ? (
              <>
                <ObjectLink id={accepted} />
                {e.current && e.current.enclaveId !== accepted ? (
                  <span className="text-xs text-[hsl(var(--status-damaged-fg))]">
                    δεν είναι το τελευταίο εγγεγραμμένο
                  </span>
                ) : null}
              </>
            ) : (
              <span className="text-muted-foreground">
                κανείς, το κανάλι δεν καταγράφει αναφορές μέχρι να ορίσει η αρχή έναν
              </span>
            )}
          </dd>
          {e.current ? (
            <>
              <dt className="text-muted-foreground">Εγγεγραμμένο Oracle Nautilus</dt>
              <dd>
                <ObjectLink id={e.current.enclaveId} />
              </dd>
              <dt className="text-muted-foreground">Δημόσιο κλειδί</dt>
              <dd className="break-all font-mono2 text-xs">{e.current.publicKey}</dd>
              <dt className="text-muted-foreground">Εγγράφηκε</dt>
              <dd className="flex flex-wrap items-center gap-x-3">
                <span className="font-mono2 text-xs">{fmtDate(e.current.at)}</span>
                <TxLink digest={e.current.txDigest} label="συναλλαγή" />
              </dd>
              <dt className="text-muted-foreground">Υποβλήθηκε από</dt>
              <dd className="flex flex-wrap items-center gap-x-2">
                <AddressLink address={e.current.owner} short />
                <span className="text-xs text-muted-foreground">
                  το πορτοφόλι που πλήρωσε την εγγραφή, όχι κριτήριο αποδοχής: η αλυσίδα έλεγξε την
                  attestation
                </span>
              </dd>
            </>
          ) : (
            <>
              <dt className="text-muted-foreground">Εγγεγραμμένο Oracle Nautilus</dt>
              <dd className="text-muted-foreground">κανένα για την τρέχουσα έκδοση της ρύθμισης</dd>
            </>
          )}
        </dl>
      )}
      {history && shown.length > 0 ? (
        <div className="mt-5">
          <h3 className="mb-2 text-[13px] font-semibold">Ιστορικό εγγραφών</h3>
          <ScrollX minWidth="40rem">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Εγγραφή</th>
                  <th className="py-2 pr-4 font-medium">Oracle Nautilus</th>
                  <th className="py-2 pr-4 font-medium">Δημόσιο κλειδί</th>
                  <th className="py-2 pr-4 font-medium">Έκδοση ρύθμισης</th>
                  <th className="py-2 text-right font-medium">Συναλλαγή</th>
                  {onAccept ? <th className="py-2 text-right font-medium">Αποδοχή</th> : null}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const stale = r.configVersion !== e?.version;
                  return (
                    <tr key={r.enclaveId} className="border-b border-border last:border-b-0">
                      <td className="whitespace-nowrap py-2.5 pr-4 font-mono2 text-xs text-muted-foreground">
                        {fmtDate(r.at)}
                      </td>
                      <td className="py-2.5 pr-4">
                        <ObjectLink id={r.enclaveId} short />
                        {r.enclaveId === accepted ? (
                          <span className="ml-2 text-xs text-[hsl(var(--status-ok-fg))]">
                            αποδεκτός
                          </span>
                        ) : e?.current?.enclaveId === r.enclaveId ? (
                          <span className="ml-2 text-xs text-muted-foreground">τελευταίος</span>
                        ) : null}
                      </td>
                      <td className="py-2.5 pr-4 font-mono2 text-xs" title={r.publicKey}>
                        {shortId(r.publicKey, 8, 6)}
                      </td>
                      <td className="py-2.5 pr-4 font-mono2 text-xs">{r.configVersion}</td>
                      <td className="whitespace-nowrap py-2.5 text-right">
                        <TxLink digest={r.txDigest} />
                      </td>
                      {onAccept ? (
                        <td className="whitespace-nowrap py-2.5 text-right">
                          {r.enclaveId === accepted ? (
                            <span className="text-xs text-muted-foreground">σε ισχύ</span>
                          ) : (
                            <Button
                              variant="neutral"
                              size="xs"
                              onClick={() => onAccept(r.enclaveId)}
                              disabled={stale}
                              title={
                                stale ? 'Εγγράφηκε με μετρήσεις που δεν ισχύουν πια' : undefined
                              }
                            >
                              Αποδοχή
                            </Button>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollX>
          {older > 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              και {fmtInt(older)} παλαιότερες εγγραφές, που το αποδεκτό Oracle Nautilus σβήνει μόνο
              του.
            </p>
          ) : null}
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Κάθε εκκίνηση του Oracle Nautilus γεννά νέο κλειδί και νέα εγγραφή. Αναφορές δέχεται
            μόνο Oracle Nautilus εγγεγραμμένο στην τρέχουσα έκδοση της ρύθμισης, δηλαδή στα PCR που
            δήλωσε τελευταία η αρχή. Μόλις η αρχή αποδεχθεί μια εγγραφή, το Oracle Nautilus σβήνει
            τις παλαιότερες εγγραφές που πλήρωσε το wallet του.
          </p>
        </div>
      ) : null}
    </Section>
  );
}

function useNow(everyMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

type VerdictTone = 'ok' | 'warn' | 'alert' | 'idle';

const VERDICT_STYLE: Record<
  VerdictTone,
  { fg: string; bg: string; border: string; icon: IconName }
> = {
  ok: {
    fg: 'var(--status-ok-fg)',
    bg: 'var(--status-ok-bg)',
    border: 'var(--status-ok-border)',
    icon: 'circle-check',
  },
  warn: {
    fg: 'var(--status-damaged-fg)',
    bg: 'var(--status-damaged-bg)',
    border: 'var(--status-damaged-border)',
    icon: 'triangle-exclamation',
  },
  alert: {
    fg: 'var(--status-destroyed-fg)',
    bg: 'var(--status-destroyed-bg)',
    border: 'var(--status-destroyed-border)',
    icon: 'circle-xmark',
  },
  idle: {
    fg: 'var(--status-missing-fg)',
    bg: 'var(--status-missing-bg)',
    border: 'var(--status-missing-border)',
    icon: 'hourglass-half',
  },
};

export function ChannelStatusSection({ id }: { id: string }) {
  const state = useEnclave();
  const regs = useEnclaveRegistrations();
  const params = useParams();
  const sources = useSources();
  const now = useNow(10_000);

  const e = state.data;
  const accepted = params.data?.acceptedEnclave ?? null;
  const endpoint = params.data?.endpoint ?? '';
  const windowMs = params.data?.windowMs ?? 60_000;
  const all = sources.data ?? [];
  const active = all.filter((s) => s.active);
  const registrations = regs.data ?? [];
  const latest = registrations[0] ?? null;
  const acceptedReg = registrations.find((r) => r.enclaveId === accepted) ?? null;
  const reports = all.reduce((n, s) => n + s.reports, 0);
  const lastAt = all
    .map((s) => s.lastReportAt)
    .filter((v): v is string => !!v)
    .sort()
    .at(-1);
  const ageMs = lastAt ? now - Date.parse(lastAt) : null;
  const horizon = Math.max(3 * windowMs, 15 * 60_000);

  const verdict: { tone: VerdictTone; label: string; hint: string } = !accepted
    ? {
        tone: 'alert',
        label: 'Χωρίς αποδεκτό Oracle Nautilus',
        hint: 'Καμία αναφορά δεν καταγράφεται μέχρι η αρχή να αποδεχθεί ένα εγγεγραμμένο Oracle Nautilus.',
      }
    : !acceptedReg
      ? {
          tone: 'alert',
          label: 'Το αποδεκτό Oracle Nautilus λείπει από τις εγγραφές',
          hint: 'Η αλυσίδα ονομάζει Oracle Nautilus που δεν εμφανίζεται στο ιστορικό εγγραφών. Ο κόμβος κρατά περιορισμένο ιστορικό συναλλαγών, οπότε η εγγραφή μπορεί απλώς να έχει βγει από το παράθυρό του.',
        }
      : e && acceptedReg.configVersion !== e.version
        ? {
            tone: 'warn',
            label: 'Εκτός τρέχουσας ρύθμισης',
            hint: `Το αποδεκτό Oracle Nautilus εγγράφηκε με την έκδοση ${acceptedReg.configVersion} της ρύθμισης, ενώ ισχύει η ${e.version}. Πρέπει να ξεκινήσει με τη νέα εικόνα και να εγγραφεί ξανά.`,
          }
        : latest && latest.enclaveId !== accepted
          ? {
              tone: 'warn',
              label: 'Νεότερη εγγραφή σε αναμονή',
              hint: 'Έχει εγγραφεί νεότερο Oracle Nautilus από αυτό που δέχεται η αρχή. Μέχρι να το αποδεχθεί, μετρά το παλιό.',
            }
          : ageMs === null
            ? {
                tone: 'idle',
                label: 'Σε αναμονή πρώτης αναφοράς',
                hint: 'Το Oracle Nautilus είναι αποδεκτό και εντός ρύθμισης. Καμία πηγή δεν έχει στείλει ακόμη ένδειξη.',
              }
            : ageMs <= horizon
              ? {
                  tone: 'ok',
                  label: 'Ενεργός',
                  hint: `Η τελευταία αναφορά καταγράφηκε ${fmtAgo(ageMs)}.`,
                }
              : {
                  tone: 'warn',
                  label: 'Σιωπηλός',
                  hint: `Η τελευταία αναφορά καταγράφηκε ${fmtAgo(ageMs)}, ενώ το παράθυρο κλείνει κάθε ${fmtWindow(windowMs)}.`,
                };

  const style = VERDICT_STYLE[verdict.tone];
  const loading = state.loading || params.loading || regs.loading || sources.loading;

  return (
    <Section
      id={id}
      title="Ζωντανή κατάσταση του καναλιού"
      icon="satellite-dish"
      note="Η εικόνα διαβάζεται από την αλυσίδα και ανανεώνεται μόνη της. Το σημείο εισόδου δέχεται μόνο ενδείξεις, οπότε η απόδειξη ότι το Oracle Nautilus ζει είναι οι αναφορές που φτάνουν: μόνο το αποδεκτό Oracle Nautilus μπορεί να τις υπογράψει."
    >
      {loading && !e ? (
        <LoadingState />
      ) : (
        <>
          <div
            className="flex flex-wrap items-center gap-x-3 gap-y-1 border px-4 py-3"
            style={{
              color: `hsl(${style.fg})`,
              backgroundColor: `hsl(${style.bg})`,
              borderColor: `hsl(${style.border})`,
            }}
          >
            <span className="inline-flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
              <Icon name={style.icon} size={16} className="shrink-0" />
              {verdict.label}
            </span>
            <span className="text-[13px] leading-snug">{verdict.hint}</span>
          </div>

          <dl className="mt-4 grid grid-cols-[8rem_1fr] items-start gap-y-2.5 text-[13px] sm:grid-cols-[11rem_1fr]">
            <dt className="text-muted-foreground">Αποδεκτό Oracle Nautilus</dt>
            <dd className="flex flex-wrap items-center gap-x-3">
              {accepted ? (
                <ObjectLink id={accepted} short />
              ) : (
                <span className="text-muted-foreground">κανείς</span>
              )}
              {acceptedReg ? (
                <span className="text-xs text-muted-foreground">
                  εγγράφηκε {fmtDateTime(acceptedReg.at)},{' '}
                  {fmtAgo(now - Date.parse(acceptedReg.at))}
                </span>
              ) : null}
            </dd>
            <dt className="text-muted-foreground">Έκδοση ρύθμισης</dt>
            <dd className="font-mono2">
              {e?.version ?? '…'}
              {acceptedReg && e && acceptedReg.configVersion !== e.version ? (
                <span
                  className="ml-2 font-sans text-xs"
                  style={{ color: `hsl(var(--status-damaged-fg))` }}
                >
                  η εγγραφή έγινε στην {acceptedReg.configVersion}
                </span>
              ) : null}
            </dd>
            <dt className="text-muted-foreground">Σημείο εισόδου</dt>
            <dd className="break-all font-mono2 text-xs">
              {endpoint || (
                <span className="font-sans text-muted-foreground">δεν έχει δημοσιευτεί</span>
              )}
            </dd>
            <dt className="text-muted-foreground">Παράθυρο συνάθροισης</dt>
            <dd>{fmtWindow(windowMs)}</dd>
            <dt className="text-muted-foreground">Αναφορές συνολικά</dt>
            <dd className="font-mono2">{fmtInt(reports)}</dd>
            <dt className="text-muted-foreground">Τελευταία αναφορά</dt>
            <dd className="flex flex-wrap items-center gap-x-3">
              {lastAt ? (
                <>
                  <span className="font-mono2 text-xs">{fmtDateTime(lastAt)}</span>
                  <span className="text-xs text-muted-foreground">
                    {fmtAgo(now - Date.parse(lastAt))}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">καμία</span>
              )}
            </dd>
            <dt className="text-muted-foreground">Ενεργές πηγές</dt>
            <dd>
              {fmtInt(active.length)} από {fmtInt(all.length)} εγγεγραμμένες
            </dd>
          </dl>

          {active.length > 0 ? (
            <div className="mt-5">
              <h3 className="mb-2 text-[13px] font-semibold">Δραστηριότητα ανά πηγή</h3>
              <ScrollX minWidth="34rem">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Πηγή</th>
                      <th className="py-2 pr-4 font-medium">Ταυτότητα κλειδιού</th>
                      <th className="py-2 pr-4 font-medium">Αναφορές</th>
                      <th className="py-2 pr-4 font-medium">Τελευταία</th>
                      <th className="py-2 font-medium">Κατάσταση</th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.map((s) => {
                      const age = s.lastReportAt ? now - Date.parse(s.lastReportAt) : null;
                      return (
                        <tr key={s.address} className="border-b border-border last:border-b-0">
                          <td className="py-2.5 pr-4">{s.name}</td>
                          <td
                            className="whitespace-nowrap py-2.5 pr-4 font-mono2 text-xs"
                            title={s.address}
                          >
                            {shortId(s.address, 8, 6)}
                          </td>
                          <td className="py-2.5 pr-4 font-mono2 text-xs">{fmtInt(s.reports)}</td>
                          <td className="whitespace-nowrap py-2.5 pr-4 font-mono2 text-xs text-muted-foreground">
                            {s.lastReportAt ? fmtDateTime(s.lastReportAt) : ''}
                          </td>
                          <td className="py-2.5">
                            {age === null ? (
                              <span className="text-muted-foreground">καμία ένδειξη ακόμη</span>
                            ) : age <= horizon ? (
                              <span
                                className="inline-flex items-center gap-1"
                                style={{ color: `hsl(var(--status-ok-fg))` }}
                              >
                                <Icon name="circle-check" size={11} /> στέλνει, τελευταία{' '}
                                {fmtAgo(age)}
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1"
                                style={{ color: `hsl(var(--status-damaged-fg))` }}
                              >
                                <Icon name="triangle-exclamation" size={11} /> σιωπηλή, τελευταία{' '}
                                {fmtAgo(age)}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ScrollX>
            </div>
          ) : null}
        </>
      )}
    </Section>
  );
}
