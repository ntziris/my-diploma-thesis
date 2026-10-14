import { createContext, useContext } from 'react';

export interface WalletAccount {
  address: string;
  label: string;
}

export interface WalletCtx {
  address: string | null;
  account: WalletAccount | null;
  connect: () => void;
  disconnect: () => void;
}

export const Ctx = createContext<WalletCtx>({
  address: null,
  account: null,
  connect: () => {},
  disconnect: () => {},
});

export function useWallet() {
  return useContext(Ctx);
}
