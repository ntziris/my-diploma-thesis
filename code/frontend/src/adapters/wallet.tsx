import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DAppKitProvider, useCurrentAccount } from '@mysten/dapp-kit-react';
import { ConnectWalletModal } from '@/components/ConnectWalletModal';
import { Ctx, type WalletAccount } from './wallet-context';
import { shortId } from './types';
import { dAppKit, suiClient } from './suiClient';
import { setSigner } from '@/tx/signer';
import { notifyChainChanged } from './suiAdapter';
import { explainAbort, explainFailure } from '@/tx/errors';

function explain(status: {
  error?: {
    message?: string;
    MoveAbort?: {
      location?: { module?: string };
      cleverError?: { constantName?: string; value?: string };
    };
  } | null;
}): string {
  const abort = status.error?.MoveAbort;
  if (abort?.cleverError) {
    return explainAbort({ module: abort.location?.module, ...abort.cleverError });
  }
  return explainFailure(status.error?.message);
}

function WalletBridge({ children }: { children: ReactNode }) {
  const current = useCurrentAccount();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setSigner(async (tx) => {
      const sender = dAppKit.stores.$connection.get().account?.address;
      if (!sender) throw new Error('Δεν υπάρχει συνδεδεμένο wallet.');
      tx.setSenderIfNotSet(sender);
      // Simulate first, so a Move abort surfaces before the wallet asks for a signature
      const sim = await suiClient.simulateTransaction({ transaction: tx });
      if (sim.$kind === 'FailedTransaction') throw new Error(explain(sim.FailedTransaction.status));
      const res = await dAppKit
        .signAndExecuteTransaction({ transaction: tx })
        .catch((e: unknown) => {
          throw new Error(explainFailure(e instanceof Error ? e.message : String(e)));
        });
      const executed = res.$kind === 'Transaction' ? res.Transaction : res.FailedTransaction;
      if (!executed.status.success) throw new Error(explain(executed.status));
      const final = await suiClient.waitForTransaction({
        digest: executed.digest,
        include: { effects: true, objectTypes: true },
      });
      const fx = final.Transaction ?? final.FailedTransaction;
      const created = (fx.effects?.changedObjects ?? [])
        .filter((o) => o.inputState === 'DoesNotExist' && o.outputState !== 'DoesNotExist')
        .map((o) => ({ objectId: o.objectId, type: fx.objectTypes?.[o.objectId] ?? '' }));
      notifyChainChanged();
      return { digest: executed.digest, created };
    });
    return () => setSigner(null);
  }, []);

  const account = useMemo<WalletAccount | null>(
    () =>
      current
        ? { address: current.address, label: current.label ?? shortId(current.address) }
        : null,
    [current],
  );
  const connect = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  const disconnect = useCallback(() => void dAppKit.disconnectWallet(), []);
  const value = useMemo(
    () => ({ address: account?.address ?? null, account, connect, disconnect }),
    [account, connect, disconnect],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <ConnectWalletModal open={open} onClose={close} />
    </Ctx.Provider>
  );
}

export function WalletProvider({ children }: { children: ReactNode }) {
  return (
    <DAppKitProvider dAppKit={dAppKit}>
      <WalletBridge>{children}</WalletBridge>
    </DAppKitProvider>
  );
}
