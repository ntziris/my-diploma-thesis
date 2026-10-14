import { useState } from 'react';
import { useWallets } from '@mysten/dapp-kit-react';
import { getWalletUniqueIdentifier } from '@mysten/dapp-kit-core';
import { dAppKit } from '@/adapters/suiClient';
import { Modal } from './Modal';
import { Icon } from './Icon';
import { explainConnectError } from '@/tx/errors';

const SLUSH_INSTALL_URL =
  'https://chromewebstore.google.com/detail/slush-%E2%80%94-a-sui-wallet/opcgpfmipidbgpenhmajoajpbobppdil';

type Wallet = ReturnType<typeof useWallets>[number];

// The dapp-kit also registers a Slush web wallet, a popup on my.slush.app, not an extension
function isWebWallet(w: Wallet) {
  return getWalletUniqueIdentifier(w).endsWith('.web');
}

export function ConnectWalletModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const wallets = useWallets();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const extensions = wallets.filter((w) => !isWebWallet(w));
  const webWallets = wallets.filter(isWebWallet);

  const close = () => {
    setBusy(null);
    setError(null);
    onClose();
  };

  const connect = async (wallet: Wallet) => {
    setBusy(wallet.name);
    setError(null);
    try {
      await dAppKit.connectWallet({ wallet });
      close();
    } catch (e) {
      setError(explainConnectError(e instanceof Error ? e.message : undefined));
      setBusy(null);
    }
  };

  const row = (w: Wallet, hint: string) => (
    <button
      type="button"
      key={getWalletUniqueIdentifier(w)}
      disabled={busy !== null}
      onClick={() => void connect(w)}
      className="flex items-center justify-between gap-3 border border-border bg-card px-4 py-3 text-left hover:border-[hsl(var(--accent))] disabled:opacity-60"
    >
      <span className="flex min-w-0 items-center gap-3">
        <img src={w.icon} alt="" className="h-7 w-7 shrink-0 rounded-full" />
        <span className="min-w-0">
          <span className="block text-sm font-medium">{w.name}</span>
          <span className="block text-xs leading-snug text-muted-foreground">{hint}</span>
        </span>
      </span>
      {busy === w.name ? (
        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-foreground" />
          Αναμονή έγκρισης…
        </span>
      ) : (
        <Icon name="arrow-right" size={12} className="shrink-0 text-muted-foreground" />
      )}
    </button>
  );

  return (
    <Modal open={open} onClose={close} title="Σύνδεση wallet">
      <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">
        Η ταυτοποίηση γίνεται αποκλειστικά μέσω wallet. Δεν υπάρχει εγγραφή, προφίλ ή email.
      </p>

      <p className="micro-label mb-1.5">Επέκταση browser</p>
      {extensions.length === 0 ? (
        <div className="border border-dashed border-border bg-secondary/40 px-4 py-3 text-[13px] leading-relaxed text-muted-foreground">
          Δεν βρέθηκε επέκταση wallet του SUI στον browser.{' '}
          <a
            href={SLUSH_INSTALL_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-foreground underline decoration-dotted underline-offset-2 hover:text-[hsl(var(--accent))]"
          >
            Εγκαταστήστε το Slush
            <Icon name="arrow-up-right-from-square" size={10} />
          </a>{' '}
          και ανανεώστε τη σελίδα.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {extensions.map((w) => row(w, 'Εγκατεστημένο στον browser.'))}
        </div>
      )}

      {webWallets.length > 0 ? (
        <>
          <p className="micro-label mb-1.5 mt-4">Χωρίς επέκταση</p>
          <div className="flex flex-col gap-2">
            {webWallets.map((w) =>
              row(w, 'Ανοίγει σε νέο παράθυρο στο my.slush.app. Χρειάζεται λογαριασμό Slush.'),
            )}
          </div>
        </>
      ) : null}

      {error ? (
        <p className="mt-3 border border-[hsl(var(--status-destroyed-border))] bg-[hsl(var(--status-destroyed-bg))] px-3 py-2 text-[13px] text-[hsl(var(--status-destroyed-fg))]">
          {error}
        </p>
      ) : null}
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Ο χρήστης πληρώνει το δικό του gas σε κάθε συναλλαγή. Το wallet ζητά έγκριση για κάθε
        υπογραφή.
      </p>
    </Modal>
  );
}
