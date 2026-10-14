import type { Transaction } from '@mysten/sui/transactions';

export interface ExecuteResult {
  digest: string;
  created: { objectId: string; type: string }[];
}

export type Signer = (tx: Transaction) => Promise<ExecuteResult>;

let signer: Signer | null = null;

export function setSigner(s: Signer | null) {
  signer = s;
}

export async function execute(tx: Transaction): Promise<ExecuteResult> {
  if (!signer) throw new Error('Δεν υπάρχει συνδεδεμένο wallet.');
  return signer(tx);
}
