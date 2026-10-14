import { Transaction, coinWithBalance } from '@mysten/sui/transactions';
import { blobIdFromInt } from '@mysten/walrus';
import type { SuiClientTypes } from '@mysten/sui/client';
import { config } from '@/config';
import { suiClient } from './suiClient';
import type { ObjectId } from './types';

export interface StoredBlob {
  objectId: ObjectId;
  shared: boolean;
  blobId: string;
  size: number;
  endEpoch: number;
  fundsFrost: bigint;
}

export interface WalrusEpoch {
  epoch: number;
  epochDurationMs: number;
}

type Fields = Record<string, unknown>;

function num(v: unknown): number {
  return typeof v === 'number' ? v : Number(v ?? 0);
}

function blobFields(b: Fields): Omit<StoredBlob, 'objectId' | 'shared' | 'fundsFrost'> {
  const storage = (b.storage ?? {}) as Fields;
  return {
    blobId: blobIdFromInt(String(b.blob_id)),
    size: num(b.size),
    endEpoch: num(storage.end_epoch),
  };
}

let walrusPackage: Promise<string> | null = null;
let walrusTypes: Promise<string> | null = null;

// The Walrus version to call, the same source the SDK uses, or an upgrade breaks the linkage
export function walrusPackageId(): Promise<string> {
  walrusPackage ??= suiClient.walrus.systemObject().then((s) => s.package_id);
  return walrusPackage;
}

// The package that defines the Walrus types, which stays at the original id across upgrades
export function walrusTypeId(): Promise<string> {
  walrusTypes ??= suiClient
    .getObject({ objectId: config.walrus.systemObjectId })
    .then((r) => (r.object.type ?? '').split('::')[0]);
  return walrusTypes;
}

export async function walrusEpoch(): Promise<WalrusEpoch> {
  const [system, staking] = await Promise.all([
    suiClient.walrus.systemState(),
    suiClient.walrus.stakingState(),
  ]);
  return { epoch: system.committee.epoch, epochDurationMs: Number(staking.epoch_duration) };
}

export async function sharedBlobs(ids: readonly ObjectId[]): Promise<StoredBlob[]> {
  if (!ids.length) return [];
  const res = await suiClient.getObjects({ objectIds: [...ids], include: { json: true } });
  const out: StoredBlob[] = [];
  for (const r of res.objects) {
    if (r instanceof Error || !r.json) continue;
    const f = r.json as Fields;
    const funds = (f.funds ?? {}) as Fields;
    out.push({
      objectId: r.objectId,
      shared: true,
      ...blobFields((f.blob ?? {}) as Fields),
      fundsFrost: BigInt(String(funds.value ?? 0)),
    });
  }
  return out;
}

// Blob objects an address owns directly, such as the Walrus Site resources of the authority
export async function ownedBlobs(owner: string): Promise<StoredBlob[]> {
  const pkg = await walrusTypeId();
  const out: StoredBlob[] = [];
  let cursor: string | null = null;
  for (;;) {
    const page: SuiClientTypes.ListOwnedObjectsResponse<{ json: true }> =
      await suiClient.listOwnedObjects({
        owner,
        type: `${pkg}::blob::Blob`,
        include: { json: true },
        cursor,
        limit: 50,
      });
    for (const o of page.objects) {
      if (!o.json) continue;
      out.push({
        objectId: o.objectId,
        shared: false,
        ...blobFields(o.json as Fields),
        fundsFrost: 0n,
      });
    }
    if (!page.hasNextPage || !page.cursor) break;
    cursor = page.cursor;
  }
  return out;
}

export async function extensionCostFrost(size: number, epochs: number): Promise<bigint> {
  return (await suiClient.walrus.storageCost(size, epochs)).storageCost;
}

// Anyone may fund a SharedBlob and extend it; the payment stays in the object as WAL
export async function fundAndExtendShared(
  tx: Transaction,
  blob: StoredBlob,
  epochs: number,
  frost: bigint,
): Promise<void> {
  const pkg = await walrusPackageId();
  const shared = tx.object(blob.objectId);
  if (frost > 0n) {
    tx.moveCall({
      target: `${pkg}::shared_blob::fund`,
      arguments: [shared, coinWithBalance({ balance: frost, type: config.walrus.walType })],
    });
  }
  tx.moveCall({
    target: `${pkg}::shared_blob::extend`,
    arguments: [shared, tx.object(config.walrus.systemObjectId), tx.pure.u32(epochs)],
  });
}

// Owned blobs are extended by their owner, paying from the owner's WAL
export async function extendOwned(
  tx: Transaction,
  blob: StoredBlob,
  epochs: number,
): Promise<void> {
  await tx.add(suiClient.walrus.extendBlob({ blobObjectId: blob.objectId, epochs }));
}

export function shareBlob(tx: Transaction, pkg: string, blobObjectId: ObjectId): void {
  tx.moveCall({ target: `${pkg}::shared_blob::new`, arguments: [tx.object(blobObjectId)] });
}
