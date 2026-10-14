import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { isValidSuiObjectId, normalizeSuiObjectId } from '@mysten/sui/utils';
import { useArtworks, useIndex, useStats } from '@/state/queries';
import { isTerminal } from '@/state/derive';
import { ArtworkCard } from '@/components/ArtworkCard';
import { fmtInt, fmtSUI } from '@/components/format';
import { Reveal } from '@/components/Reveal';
import { Icon, type IconName } from '@/components/Icon';
import coverArt from '@/assets/cover-art.svg';
import suiLogo from '@/assets/stack/sui.svg';
import walrusLogo from '@/assets/stack/walrus.svg';
import sealLogo from '@/assets/stack/seal.svg';
import nautilusLogo from '@/assets/stack/nautilus.svg';
import { ButtonLink } from '@/components/Button';

export function LandingView() {
  const stats = useStats();
  const index = useIndex();
  const navigate = useNavigate();
  const [verifyId, setVerifyId] = useState('');
  const [verifyInvalid, setVerifyInvalid] = useState(false);

  const recentIds = useMemo(
    () =>
      (index.data ?? [])
        .filter((s) => !isTerminal(s))
        .sort((a, b) => b.position - a.position)
        .slice(0, 4)
        .map((s) => s.id),
    [index.data],
  );
  const recent = useArtworks(recentIds);
  const s = stats.data;

  return (
    <div>
      <section className="relative flex min-h-[calc(100vh-3.5rem)] flex-col overflow-hidden border-b border-border">
        <div className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-12 px-6 py-10">
          <div className="grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10">
            <div className="order-2 text-center lg:order-1">
              <h1 className="font-display text-4xl font-semibold tracking-tight text-[hsl(var(--accent))] sm:text-6xl lg:text-7xl">
                ArtTokenization
              </h1>
              <p className="mx-auto mt-6 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
                Κλασματοποίηση έργων τέχνης, με πιστοποιητικά γνησιότητας, πλήρες ιστορικό
                προέλευσης και απόλυτη διαφάνεια, πάνω σε πλήρως αποκεντρωμένη υποδομή.
              </p>

              <p className="mt-5 inline-flex items-center gap-2 border border-[hsl(var(--status-damaged-border))] bg-[hsl(var(--status-damaged-bg))] px-3.5 py-1.5 text-xs font-medium text-[hsl(var(--status-damaged-fg))]">
                <Icon name="graduation-cap" size={12} className="shrink-0" />
                Ερευνητικό πρωτότυπο σε δίκτυο δοκιμών
              </p>
            </div>

            <div
              className="relative order-1 mx-auto w-40 sm:w-52 lg:order-2 lg:mx-0 lg:w-[19rem] lg:justify-self-center"
              aria-hidden
            >
              <div className="hero-block-shadow" />
              <img
                src={coverArt}
                alt=""
                draggable={false}
                className="hero-block w-full select-none"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-stretch justify-center gap-3">
            <ButtonLink to="/catalogue" size="lg" iconRight="arrow-right" className="shrink-0">
              Εξερευνήστε τον κατάλογο
            </ButtonLink>
            <div className="flex flex-col">
              <form
                className="flex items-stretch border border-input bg-card/70 transition-colors focus-within:border-[hsl(var(--accent))]"
                onSubmit={(e) => {
                  e.preventDefault();
                  const value = verifyId.trim();
                  if (!value) return void navigate('/verify');
                  if (!isValidSuiObjectId(value)) return setVerifyInvalid(true);
                  void navigate(`/verify/${normalizeSuiObjectId(value)}`);
                }}
              >
                <span className="flex items-center pl-3 text-muted-foreground/60">
                  <Icon name="magnifying-glass" size={13} />
                </span>
                <input
                  value={verifyId}
                  onChange={(e) => {
                    setVerifyId(e.target.value);
                    setVerifyInvalid(false);
                  }}
                  placeholder="ID έργου…"
                  aria-label="Αναγνωριστικό έργου"
                  aria-invalid={verifyInvalid || undefined}
                  className="w-40 min-w-0 bg-transparent px-3 font-mono2 text-sm outline-none placeholder:text-muted-foreground/60 sm:w-72"
                />
                <button
                  type="submit"
                  className="flex shrink-0 items-center gap-2 border-l border-input px-4 py-3 text-sm font-medium text-[hsl(var(--accent))] transition-colors hover:bg-[hsl(var(--accent)/0.08)]"
                >
                  <Icon name="shield-halved" size={13} />
                  Επαλήθευση
                </button>
              </form>
              {verifyInvalid ? (
                <p className="mt-1.5 text-left text-xs text-[hsl(var(--status-destroyed-fg))]">
                  Μη έγκυρο αναγνωριστικό. Ένα object id είναι 0x και 64 δεκαεξαδικοί χαρακτήρες.
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="relative z-10 flex justify-center pb-6">
          <button
            type="button"
            onClick={() => document.getElementById('stats')?.scrollIntoView({ behavior: 'smooth' })}
            className="flex flex-col items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
          >
            Κύλιση
            <span className="animate-bounce leading-none motion-reduce:animate-none">
              <Icon name="arrow-down" size={14} />
            </span>
          </button>
        </div>
      </section>

      <section id="stats" className="scroll-mt-14 border-b border-border bg-card">
        <div className="mx-auto max-w-6xl px-6 py-6">
          <Reveal>
            <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
              <Stat value={s ? fmtInt(s.worksLive) : '…'} label="έργα στην πλατφόρμα" />
              <Stat value={s ? fmtInt(s.galleriesActive) : '…'} label="πιστοποιημένες γκαλερί" />
              <Stat
                value={s ? fmtInt(s.fractionsOutstanding) : '…'}
                label="κλάσματα σε κυκλοφορία"
              />
              <Stat
                value={s ? fmtSUI(s.royaltiesMist) : '…'}
                label="δικαίωμα παρακολούθησης, καταβλημένο αυτόματα"
              />
            </dl>
            <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <Icon name="circle-info" size={13} className="shrink-0" />
              Όλα τα νούμερα διαβάζονται ζωντανά από τους μετρητές της αλυσίδας.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <Reveal>
            <h2 className="micro-label mb-6">Πώς λειτουργεί</h2>
          </Reveal>
          <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <Step n={1} title="Πιστοποίηση">
              Η γκαλερί που φυλάσσει το έργο εκδίδει πιστοποιητικό που δένεται μόνιμα πάνω στο ίδιο
              το έργο.
            </Step>
            <Step n={2} title="Κλασματοποίηση">
              Ο καλλιτέχνης εκδίδει κλάσματα και ο επενδυτής αποκτά μερίδιο με όποιο ποσό επιθυμεί.
            </Step>
            <Step n={3} title="Αγορά με δικαίωμα παρακολούθησης">
              Κάθε μεταπώληση καταβάλλει αυτόματα το δικαίωμα παρακολούθησης (royalty), χωρίς
              μεσάζοντα.
            </Step>
            <Step n={4} title="Πλήρης αποκέντρωση">
              Χωρίς κανέναν κεντρικό server, από τα αρχεία μέχρι τη σελίδα που βλέπετε τώρα.
            </Step>
          </ol>
        </div>
      </section>

      <section className="border-b border-border bg-card">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <Reveal>
            <h2 className="micro-label mb-6">Πρόσφατα έργα</h2>
          </Reveal>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {(recent.data ?? []).map((a, i) => (
              <Reveal key={a.id} delay={i * 90} className="flex">
                <ArtworkCard
                  artwork={a}
                  terminal={isTerminal(a)}
                  condition={a.lastReport?.condition ?? null}
                />
              </Reveal>
            ))}
          </div>
          <Reveal delay={120}>
            <div className="mt-6">
              <ButtonLink to="/catalogue" variant="outline" size="md">
                Ολόκληρος ο κατάλογος
              </ButtonLink>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="scroll-mt-14 border-b border-border" id="stack">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <Reveal>
            <h2 className="micro-label mb-6">Χτισμένο στο SUI Full Stack</h2>
          </Reveal>
          <div className="grid gap-6 sm:grid-cols-3 lg:grid-cols-5">
            <Reveal>
              <Tech name="SUI" logo={suiLogo}>
                Έξυπνα συμβόλαια Move και εκτέλεση
              </Tech>
            </Reveal>
            <Reveal delay={80}>
              <Tech name="Walrus" logo={walrusLogo}>
                Αποκεντρωμένη αποθήκευση αρχείων
              </Tech>
            </Reveal>
            <Reveal delay={160}>
              <Tech name="Walrus Sites" logo={walrusLogo}>
                Αποκεντρωμένη φιλοξενία της διεπαφής
              </Tech>
            </Reveal>
            <Reveal delay={240}>
              <Tech name="Seal" logo={sealLogo}>
                Έλεγχος πρόσβασης με κρυπτογράφηση
              </Tech>
            </Reveal>
            <Reveal delay={320}>
              <Tech name="Nautilus" logo={nautilusLogo}>
                Oracles σε περιβάλλοντα αξιόπιστης εκτέλεσης
              </Tech>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="bg-card">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 sm:grid-cols-3">
          <Reveal>
            <Cta
              icon="palette"
              title="Είστε καλλιτέχνης;"
              text="Εκδόστε το έργο σας στην πλατφόρμα μας."
            >
              <ButtonLink to="/mint" variant="outline">
                Έκδοση έργου
              </ButtonLink>
            </Cta>
          </Reveal>
          <Reveal delay={100}>
            <Cta
              icon="chart-line"
              title="Είστε επενδυτής;"
              text="Αποκτήστε κλάσματα έργων με πλήρη διαφάνεια."
            >
              <ButtonLink to="/catalogue" variant="outline">
                Κατάλογος
              </ButtonLink>
            </Cta>
          </Reveal>
          <Reveal delay={200}>
            <Cta
              icon="building-columns"
              title="Είστε γκαλερί;"
              text="Ενταχθείτε στο μητρώο και πιστοποιήστε έργα."
            >
              <ButtonLink to="/galleries" variant="outline" iconRight="arrow-right">
                Μάθετε περισσότερα
              </ButtonLink>
            </Cta>
          </Reveal>
        </div>
      </section>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dd className="font-display text-2xl font-semibold tracking-tight">{value}</dd>
      <dt className="mt-0.5 text-xs text-muted-foreground">{label}</dt>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: string }) {
  return (
    <li>
      <Reveal delay={(n - 1) * 100}>
        <p className="font-display text-lg font-semibold">
          <span className="mr-2 text-[hsl(var(--accent))]">{n}.</span>
          {title}
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{children}</p>
      </Reveal>
    </li>
  );
}

function Tech({ name, logo, children }: { name: string; logo: string; children: string }) {
  return (
    <div className="border-l-2 border-[hsl(var(--accent))] pl-3">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <img src={logo} alt="" className="h-5 w-5 shrink-0 object-contain" />
        {name}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

function Cta({
  icon,
  title,
  text,
  children,
}: {
  icon: IconName;
  title: string;
  text: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="flex items-center gap-2.5 font-display text-lg font-semibold">
        <Icon name={icon} size={16} className="text-[hsl(var(--accent))]" />
        {title}
      </h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{text}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}
