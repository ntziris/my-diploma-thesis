import { useEffect, useRef, useState } from 'react';
import { useWallet } from '@/adapters/wallet-context';
import { useGalleries } from '@/state/queries';
import { createMintArtwork } from '@/tx/transactions';
import { useTx } from '@/tx/useTx';
import { Section, EmptyState, InfoNote, Page, WarningNote } from '@/components/primitives';
import { TxDone, TxFeedback } from '@/components/TxFeedback';
import { Icon } from '@/components/Icon';
import { shortId } from '@/adapters';
import { Button, ButtonLink } from '@/components/Button';

export function MintView() {
  const { address, account } = useWallet();
  const registry = useGalleries().data ?? [];
  const galleries = registry.filter((g) => g.active);
  const [form, setForm] = useState({
    title: '',
    artistName: '',
    year: '',
    medium: '',
    dimensions: '',
    description: '',
  });
  const [galleryAddress, setGalleryAddress] = useState('');
  const [artistEdited, setArtistEdited] = useState(false);
  const suggestedName = account?.label && !/^0x[0-9a-f]/i.test(account.label) ? account.label : '';
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  const [hires, setHires] = useState<File | null>(null);
  const [step, setStep] = useState('');
  const [artworkId, setArtworkId] = useState('');
  const [storageError, setStorageError] = useState<string | null>(null);
  const [hasResume, setHasResume] = useState(false);
  const resume = useRef<ReturnType<typeof createMintArtwork> | null>(null);
  const tx = useTx();

  useEffect(() => {
    const url = preview?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [preview?.url]);

  if (!address) {
    return (
      <Page>
        <EmptyState
          title="Συνδέστε το wallet σας"
          hint="Η έκδοση νέου έργου απαιτεί συνδεδεμένο wallet. Θα σας ζητηθεί υπογραφή στη συναλλαγή έκδοσης."
        />
      </Page>
    );
  }

  const set =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const artistName = (artistEdited ? form.artistName : suggestedName).trim();
  const gallery = galleries.find((g) => g.address === galleryAddress) ?? null;

  const valid =
    form.title.trim() !== '' &&
    artistName !== '' &&
    form.year.trim() !== '' &&
    !!preview &&
    !!gallery;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preview || !gallery) return;
    if (!resume.current) {
      resume.current = createMintArtwork(
        {
          artist: address,
          artistName,
          intendedGallery: { address: gallery.address, name: gallery.name },
          title: form.title.trim(),
          year: form.year.trim(),
          medium: form.medium.trim(),
          dimensions: form.dimensions.trim(),
          description: form.description.trim(),
          preview: preview.file,
          hires,
        },
        setStep,
      );
      setHasResume(true);
    }
    const res = await tx.run(resume.current);
    setStep('');
    if (res) {
      setArtworkId(res.artworkId);
      setStorageError(res.storageError);
    }
  };

  if (tx.digest) {
    return (
      <Page>
        <Section title="Έκδοση νέου έργου" icon="certificate">
          <TxDone
            message="Το έργο εκδόθηκε"
            digest={tx.digest}
            detail={
              <>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  Το έργο καταχωρίστηκε στην αλυσίδα και τα αρχεία αποθηκεύτηκαν αποκεντρωμένα στο
                  Walrus. Επόμενο βήμα: παραδίδετε το φυσικό έργο στη γκαλερί, η οποία καταχωρίζει
                  τη φύλαξη και εκδίδει το πιστοποιητικό. Μέχρι τότε μπορείτε να ακυρώσετε την
                  έκδοση από το χαρτοφυλάκιό σας.
                </p>
                {storageError ? (
                  <WarningNote>
                    Η σύνδεση της αποθήκευσης με το έργο δεν ολοκληρώθηκε ({storageError}). Το έργο
                    εκδόθηκε κανονικά και τα αρχεία είναι στο Walrus, η παράταση της αποθήκευσης
                    όμως δεν είναι ακόμη διαθέσιμη από τη σελίδα του έργου.
                  </WarningNote>
                ) : null}
              </>
            }
            action={
              artworkId ? (
                <ButtonLink to={`/artwork/${artworkId}`} icon="eye">
                  Προβολή έργου
                </ButtonLink>
              ) : null
            }
          />
        </Section>
      </Page>
    );
  }

  return (
    <Page title="Έκδοση νέου έργου">
      <Section title="Στοιχεία έργου" icon="file-lines">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Τίτλος *"
              value={form.title}
              onChange={set('title')}
              placeholder="Ηλιοβασίλεμα ΙΙ"
            />
            <Field
              label="Καλλιτέχνης *"
              value={artistEdited ? form.artistName : suggestedName}
              onChange={(e) => {
                setArtistEdited(true);
                set('artistName')(e);
              }}
              placeholder="Ονοματεπώνυμο ή ψευδώνυμο, όπως υπογράφετε το έργο"
            />
            <Field
              label="Έτος δημιουργίας *"
              value={form.year}
              onChange={set('year')}
              placeholder="2025"
            />
            <Field
              label="Μέσο / υλικό"
              value={form.medium}
              onChange={set('medium')}
              placeholder="Ελαιογραφία σε καμβά"
            />
            <Field
              label="Διαστάσεις"
              value={form.dimensions}
              onChange={set('dimensions')}
              placeholder="80 x 60 εκ."
            />
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium">Γκαλερί παράδοσης *</span>
              <select
                value={galleryAddress}
                onChange={(e) => setGalleryAddress(e.target.value)}
                required
                className="border border-input bg-card px-3 py-1.5 outline-none focus:border-[hsl(var(--accent))]"
              >
                <option value="" disabled>
                  Επιλέξτε γκαλερί
                </option>
                {galleries.map((g) => (
                  <option key={g.address} value={g.address}>
                    {g.name} ({shortId(g.address)})
                  </option>
                ))}
              </select>
            </label>
          </div>
          {galleries.length === 0 ? (
            <WarningNote>
              Δεν υπάρχει ενεργή γκαλερί στο μητρώο αυτή τη στιγμή, οπότε δεν μπορεί να οριστεί
              παραλήπτης. Το μητρώο το διαχειρίζεται η ρυθμιστική αρχή.
            </WarningNote>
          ) : (
            <InfoNote>
              Η γκαλερί που επιλέγετε βλέπει το έργο στον πίνακά της ως αναμενόμενη παραλαβή και
              είναι η μόνη που μπορεί να καταχωρίσει την παραλαβή του. Η φύλαξη ξεκινά μόνο όταν το
              κάνει, και μέχρι τότε μπορείτε να ακυρώσετε την έκδοση από το χαρτοφυλάκιό σας.
            </InfoNote>
          )}
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium">Περιγραφή</span>
            <textarea
              value={form.description}
              onChange={set('description')}
              placeholder="Σύντομη περιγραφή του έργου"
              rows={3}
              className="border border-input bg-card px-3 py-2 outline-none focus:border-[hsl(var(--accent))]"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium">Εικόνα προβολής *</span>
              <div className="flex min-w-0 items-center gap-3">
                <label className="flex shrink-0 cursor-pointer items-center gap-2 border border-[hsl(var(--accent))] text-[hsl(var(--accent))] px-4 py-1.5 text-[13px] hover:bg-[hsl(var(--accent)/0.08)]">
                  <Icon name="arrow-up-from-bracket" size={12} />
                  Επιλογή αρχείου…
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setPreview({ file: f, url: URL.createObjectURL(f) });
                    }}
                  />
                </label>
                <span
                  className="min-w-0 truncate text-xs text-muted-foreground"
                  title={preview?.file.name}
                >
                  {preview ? preview.file.name : 'δημόσια, στο Walrus'}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-1 text-[13px]">
              <span className="font-medium">Υψηλή ανάλυση</span>
              <div className="flex min-w-0 items-center gap-3">
                <label className="flex shrink-0 cursor-pointer items-center gap-2 border border-[hsl(var(--accent))] text-[hsl(var(--accent))] px-4 py-1.5 text-[13px] hover:bg-[hsl(var(--accent)/0.08)]">
                  <Icon name="arrow-up-from-bracket" size={12} />
                  Επιλογή αρχείου…
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => setHires(e.target.files?.[0] ?? null)}
                  />
                </label>
                <span
                  className="min-w-0 truncate text-xs text-muted-foreground"
                  title={hires?.name}
                >
                  {hires ? hires.name : 'κρυπτογραφείται με Seal, ορατή μόνο σε κατόχους'}
                </span>
              </div>
            </div>
          </div>

          {preview ? (
            <img
              src={preview.url}
              alt="Προεπισκόπηση"
              className="max-h-64 w-auto border border-border object-contain"
            />
          ) : null}

          <InfoNote>Τα αρχεία αποθηκεύονται αποκεντρωμένα στο Walrus.</InfoNote>
          <InfoNote>
            Μετά την έκδοση, παραδίδετε το φυσικό έργο σε πιστοποιημένη γκαλερί, η οποία καταχωρίζει
            τη φύλαξη και εκδίδει το πιστοποιητικό.
          </InfoNote>

          {!hires ? (
            <WarningNote>
              Χωρίς αρχείο υψηλής ανάλυσης το έργο εκδίδεται μόνο με τη δημόσια εικόνα, οπότε δεν
              υπάρχει περιεχόμενο υπό τον έλεγχο πρόσβασης του Seal.
            </WarningNote>
          ) : null}
          <TxFeedback {...tx} pendingLabel={step || undefined} />

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={!valid || tx.busy} size="md">
              {tx.error && hasResume ? 'Συνέχιση έκδοσης' : 'Έκδοση έργου'}
            </Button>
            <span className="text-xs text-muted-foreground">Θα ζητηθεί υπογραφή στο wallet</span>
          </div>
        </form>
      </Section>
    </Page>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-[13px]">
      <span className="font-medium">{label}</span>
      <input
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="border border-input bg-card px-3 py-1.5 outline-none placeholder:text-muted-foreground/60 focus:border-[hsl(var(--accent))]"
      />
    </label>
  );
}
