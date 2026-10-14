import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useCurrentAccount, useCurrentWallet } from '@mysten/dapp-kit-react';
import { dAppKit, suiClient } from '@/adapters/suiClient';
import { useRead } from '@/state/store';
import { useGalleries, useParams } from '@/state/queries';
import { shortId } from '@/adapters';
import { config } from '@/config';
import { fmtCoin } from './format';
import { Icon } from './Icon';
import { cn } from '@/lib/utils';
import { useDismiss } from '@/lib/useDismiss';
import { Button } from './Button';

export function AccountMenu({ onDisconnect }: { onDisconnect: () => void }) {
  const wallet = useCurrentWallet();
  const account = useCurrentAccount();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showAccounts, setShowAccounts] = useState(false);
  // Closing the panel also folds the account list, so it opens compact next time
  const closePanel = useCallback(() => {
    setOpen(false);
    setShowAccounts(false);
  }, []);
  const box = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const address = account?.address ?? null;
  const galleries = useGalleries();
  const params = useParams();
  // The same source as useRole: the AdminCap holder from the chain, the config as fallback
  const authority = params.data?.authority ?? config.authority;
  // What the chain knows about an address: the role name, the gallery name when it has one, and a dot colour
  const roleOf = (addr: string): { name: string; label: string | null; dot: string } => {
    if (addr === authority)
      return { name: 'Ρυθμιστική αρχή', label: null, dot: 'bg-[hsl(var(--status-destroyed-fg))]' };
    const gallery = galleries.data?.find((g) => g.address === addr && g.active) ?? null;
    if (gallery)
      return {
        name: 'Πιστοποιημένη γκαλερί',
        label: gallery.name,
        dot: 'bg-[hsl(var(--status-ok-fg))]',
      };
    return { name: 'Καλλιτέχνης/Επενδυτής', label: null, dot: 'bg-[hsl(var(--accent))]' };
  };
  const dotClass = (dot: string) => cn('inline-block h-2 w-2 shrink-0 rounded-full', dot);
  // Every coin the address holds; SUI and WAL are picked out by type, so no package id is hardcoded
  const balances = useRead(address ? `balances:${address}` : null, () =>
    suiClient.listBalances({ owner: address!, limit: 50 }),
  );
  const coin = (suffix: string): bigint | null => {
    const b = balances.data?.balances.find((x) => x.coinType.endsWith(suffix));
    return b ? BigInt(b.balance) : balances.data ? 0n : null;
  };
  const fmtBalance = (units: bigint | null, symbol: string) =>
    units !== null ? fmtCoin(units, symbol) : balances.loading ? '…' : 'μη διαθέσιμο';

  useDismiss(box, open, closePanel);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  if (!account || !address) return null;

  const me = roleOf(address);

  const others = (wallet?.accounts ?? []).filter((a) => a.address !== address);

  const copy = () => {
    void navigator.clipboard
      ?.writeText(address)
      .then(() => setCopied(true))
      .catch(() => {});
  };

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={panelId}
        aria-label="Λογαριασμός"
        className="flex shrink-0 items-center gap-2 border border-border bg-card/70 px-3 py-1.5 text-foreground transition-colors"
      >
        <span className={dotClass(me.dot)} />
        <span className="max-w-[11rem] truncate text-xs font-medium">{me.label ?? me.name}</span>
        <Icon
          name="arrow-down"
          size={9}
          className={cn('text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>

      {open ? (
        <div
          id={panelId}
          className="pop-enter absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(24rem,calc(100vw-2rem))] border border-border bg-card shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <p className="micro-label">Λογαριασμός</p>
            {wallet ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <img src={wallet.icon} alt="" className="h-4 w-4 rounded-full" />
                {wallet.name}
              </span>
            ) : null}
          </div>

          <div className="px-4 py-3">
            {me.label ? <p className="text-sm font-medium">{me.label}</p> : null}
            <p className="flex items-center gap-2 text-xs">
              <span className={dotClass(me.dot)} />
              <span className="font-medium">{me.name}</span>
            </p>

            <p className="mt-3 break-all font-mono2 text-[11px] leading-snug text-muted-foreground">
              {address}
            </p>
            <div className="mt-1.5 flex items-center gap-3 text-xs">
              <button
                type="button"
                onClick={copy}
                className="text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
              >
                {copied ? 'Αντιγράφηκε' : 'Αντιγραφή'}
              </button>
              <a
                href={config.explorer.address(address)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
              >
                Προβολή στον SUI Explorer
                <Icon name="arrow-up-right-from-square" size={9} />
              </a>
            </div>

            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Υπόλοιπο</dt>
              <dd className="font-mono2">{fmtBalance(coin('::sui::SUI'), 'SUI')}</dd>
              <dt className="text-muted-foreground" />
              <dd className="font-mono2">{fmtBalance(coin('::wal::WAL'), 'WAL')}</dd>
              <dt className="text-muted-foreground">Δίκτυο</dt>
              <dd className="font-mono2">{config.network}</dd>
            </dl>
          </div>

          {others.length > 0 ? (
            <div className="border-t border-border">
              <button
                type="button"
                onClick={() => setShowAccounts((v) => !v)}
                aria-expanded={showAccounts}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-secondary/40"
              >
                <span className="micro-label">Αλλαγή λογαριασμού ({others.length})</span>
                <Icon
                  name="arrow-down"
                  size={9}
                  className={cn(
                    'text-muted-foreground transition-transform',
                    showAccounts && 'rotate-180',
                  )}
                />
              </button>
              <div className="collapse-region" data-open={showAccounts}>
                <div inert={!showAccounts}>
                  <ul className="max-h-[40vh] overflow-y-auto pb-1">
                    {others.map((a) => {
                      const r = roleOf(a.address);
                      return (
                        <li key={a.address}>
                          <button
                            type="button"
                            onClick={() => {
                              dAppKit.switchAccount({ account: a });
                            }}
                            className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left transition-colors hover:bg-secondary/50"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-[13px] font-medium">
                                {r.label ?? r.name}
                              </span>
                              <span className="block font-mono2 text-[11px] text-muted-foreground">
                                {shortId(a.address, 10, 8)}
                              </span>
                            </span>
                            <Icon
                              name="arrow-right"
                              size={11}
                              className="shrink-0 text-muted-foreground"
                            />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </div>
          ) : null}

          <div className="border-t border-border px-4 py-3">
            <Button
              variant="danger"
              size="lg"
              block
              icon="right-from-bracket"
              onClick={() => {
                closePanel();
                onDisconnect();
              }}
            >
              Αποσύνδεση
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
