import { useEffect, useState } from 'react';
import type { Artwork } from '@/adapters';
import { decryptPrivate, type Requester } from '@/adapters/seal';
import { sniff } from '@/lib/walrusFile';
import { errorMessage } from '@/tx/errors';
import { LoadingState, WarningNote } from '@/components/primitives';
import { Icon } from '@/components/Icon';

type State =
  | { kind: 'working'; label: string }
  | { kind: 'done'; url: string; ext: string }
  | { kind: 'error'; message: string };

export function HiresViewer({
  artwork,
  address,
  requester,
}: {
  artwork: Artwork;
  address: string;
  requester: Requester;
}) {
  const [state, setState] = useState<State>({ kind: 'working', label: 'Προετοιμασία…' });

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    (async () => {
      // A dependency change revokes the previous object URL, so a 'done' state must not survive it
      setState((s) => (s.kind === 'working' ? s : { kind: 'working', label: 'Προετοιμασία…' }));
      try {
        const bytes = await decryptPrivate(
          {
            address,
            artworkId: artwork.id,
            imageBlobId: artwork.imageBlobId,
            sealSalt: artwork.sealSalt,
            blobId: artwork.hiresBlobId,
            requester,
          },
          (label) => {
            if (!cancelled) setState({ kind: 'working', label });
          },
        );
        const { mime, ext } = sniff(bytes);
        url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime }));
        if (!cancelled) setState({ kind: 'done', url, ext });
      } catch (e) {
        if (!cancelled) setState({ kind: 'error', message: errorMessage(e) });
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [artwork.id, artwork.imageBlobId, artwork.sealSalt, artwork.hiresBlobId, address, requester]);

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted-foreground">
        Το αρχείο είναι κρυπτογραφημένο με Seal στο Walrus. Οι διακομιστές κλειδιών ελέγχουν την
        πολιτική του έργου στην αλυσίδα (
        {requester.kind === 'owner' ? 'ιδιοκτήτης του έργου' : 'κάτοχος κλασμάτων'}) και η
        αποκρυπτογράφηση γίνεται στον browser σας.
      </p>
      {state.kind === 'working' ? <LoadingState label={state.label} /> : null}
      {state.kind === 'error' ? <WarningNote tone="red">{state.message}</WarningNote> : null}
      {state.kind === 'done' ? (
        <>
          <img
            src={state.url}
            alt={`${artwork.title} σε υψηλή ανάλυση`}
            className="mx-auto max-h-[75vh] max-w-full border border-border object-contain"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="font-mono2 break-all">blob: {artwork.hiresBlobId}</span>
            <a
              href={state.url}
              download={`${artwork.id.slice(0, 10)}-hires.${state.ext}`}
              className="inline-flex items-center gap-1 text-[hsl(var(--accent))] underline decoration-dotted underline-offset-2"
            >
              <Icon name="file-lines" size={11} /> Λήψη αρχείου
            </a>
          </div>
        </>
      ) : null}
    </div>
  );
}
