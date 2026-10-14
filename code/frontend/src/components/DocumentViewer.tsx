import { useEffect, useState } from 'react';
import { config } from '@/config';
import { Modal } from '@/components/Modal';
import { LoadingState } from '@/components/primitives';
import { Icon } from '@/components/Icon';
import { sniff } from '@/lib/walrusFile';
import { errorMessage } from '@/tx/errors';
import { Button } from './Button';

type Loaded =
  | { kind: 'pdf' | 'image'; url: string }
  | { kind: 'other'; url: string }
  | { kind: 'error'; message: string };

export function DocumentButton({ blobId, label }: { blobId: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} variant="outline" size="xs" icon="file-lines">
        {label}
      </Button>
      <DocumentModal open={open} onClose={() => setOpen(false)} blobId={blobId} title={label} />
    </>
  );
}

export function DocumentModal({
  open,
  onClose,
  blobId,
  title,
}: {
  open: boolean;
  onClose: () => void;
  blobId: string;
  title: string;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="xl">
      {open && <DocumentBody blobId={blobId} title={title} />}
    </Modal>
  );
}

function DocumentBody({ blobId, title }: { blobId: string; title: string }) {
  const [state, setState] = useState<Loaded | null>(null);
  const source = config.walrus.url(blobId);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    (async () => {
      try {
        const res = await fetch(source);
        if (!res.ok) throw new Error(`Ο aggregator απάντησε ${res.status}`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        const { kind, mime } = sniff(bytes);
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
        if (!cancelled) setState({ kind, url: objectUrl });
      } catch (e) {
        if (!cancelled) setState({ kind: 'error', message: errorMessage(e) });
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source]);

  return (
    <div className="space-y-3">
      {!state && <LoadingState label="Λήψη του αρχείου από το Walrus…" />}
      {state?.kind === 'error' && (
        <p className="border border-border bg-secondary/50 px-3 py-2 text-sm">
          Το αρχείο δεν μπόρεσε να φορτωθεί: {state.message}
        </p>
      )}
      {state?.kind === 'pdf' && (
        <iframe
          src={state.url}
          title={title}
          className="h-[78vh] w-full border border-border bg-white"
        />
      )}
      {state?.kind === 'image' && (
        <img
          src={state.url}
          alt={title}
          className="mx-auto max-h-[78vh] max-w-full border border-border"
        />
      )}
      {state?.kind === 'other' && (
        <p className="text-sm text-muted-foreground">
          Ο τύπος του αρχείου δεν υποστηρίζεται για προεπισκόπηση.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="font-mono2 break-all">blob: {blobId}</span>
        <a
          href={state && state.kind !== 'error' ? state.url : source}
          download={state?.kind === 'pdf' ? `${blobId.slice(0, 8)}.pdf` : undefined}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[hsl(var(--accent))] underline decoration-dotted underline-offset-2"
        >
          <Icon name="file-lines" size={11} /> Λήψη αρχείου
        </a>
      </div>
    </div>
  );
}
