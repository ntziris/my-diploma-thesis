import { blobIdFromInt } from '@mysten/walrus';
import type { Transaction } from '@mysten/sui/transactions';
import type { WriteBlobStepEncoded, WriteBlobStepUploaded } from '@mysten/walrus';
import { config } from '@/config';
import { suiClient } from './suiClient';
import type { ExecuteResult } from '@/tx/signer';

// Walrus: encode locally, register on chain, upload the slivers, certify on chain
export interface BlobFlow {
  encode(): Promise<string>;
  register(owner: string): Transaction;
  upload(digest: string, created: ExecuteResult['created']): Promise<void>;
  certify(tx: Transaction): Promise<void>;
  objectId(): string;
}

export interface StorageAdapter {
  blob(contents: Blob | Uint8Array): BlobFlow;
}

async function toBytes(contents: Blob | Uint8Array): Promise<Uint8Array> {
  return contents instanceof Uint8Array ? contents : new Uint8Array(await contents.arrayBuffer());
}

async function createdBlobs(created: ExecuteResult['created']): Promise<Map<string, string>> {
  const ids = created.filter((o) => o.type.endsWith('::blob::Blob')).map((o) => o.objectId);
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const { objects } = await suiClient.core.getObjects({ objectIds: ids, include: { json: true } });
  for (const o of objects) {
    if (o instanceof Error) continue;
    const json = (o as { json?: { blob_id?: string } }).json;
    if (json?.blob_id) out.set(blobIdFromInt(json.blob_id), o.objectId);
  }
  return out;
}

export const walrusStorage: StorageAdapter = {
  blob(contents) {
    let bytes: Uint8Array | null = null;
    let flow: ReturnType<typeof suiClient.walrus.writeBlobFlow> | null = null;
    let encoded: WriteBlobStepEncoded | null = null;
    let uploaded: WriteBlobStepUploaded | null = null;
    let blobObjectId = '';
    return {
      async encode() {
        bytes = await toBytes(contents);
        flow = suiClient.walrus.writeBlobFlow({ blob: bytes });
        encoded = await flow.encode();
        return encoded.blobId;
      },
      register(owner) {
        if (!flow || !encoded) throw new Error('encode must run before register');
        return flow.register({ epochs: config.walrus.storageEpochs, deletable: false, owner });
      },
      async upload(digest, created) {
        if (!encoded || !bytes) throw new Error('encode must run before upload');
        blobObjectId = (await createdBlobs(created)).get(encoded.blobId) ?? '';
        if (!blobObjectId)
          throw new Error('Το αντικείμενο του blob δεν βρέθηκε στη συναλλαγή καταχώρισης.');
        let lastError: unknown = null;
        for (let attempt = 1; attempt <= 4; attempt++) {
          try {
            // A failed upload may leave its flow aborted. Recreate it from the paid on-chain
            // registration so retries never register or charge storage a second time.
            const retryFlow = suiClient.walrus.writeBlobFlow({
              blob: bytes,
              resume: {
                step: 'registered',
                blobId: encoded.blobId,
                blobObjectId,
                txDigest: digest,
                ...(encoded.nonce ? { nonce: encoded.nonce } : {}),
              },
            });
            await retryFlow.encode();
            uploaded = await retryFlow.upload({ deletable: false });
            return;
          } catch (e) {
            lastError = e;
            if (attempt < 4) await new Promise((r) => setTimeout(r, 2500 * 2 ** (attempt - 1)));
          }
        }
        throw new Error(
          `Η αποστολή μέσω του Walrus upload relay απέτυχε τέσσερις φορές (${
            lastError instanceof Error ? lastError.message : String(lastError)
          }). Δοκιμάστε ξανά σε λίγο.`,
        );
      },
      async certify(tx) {
        if (!uploaded) throw new Error('upload must run before certify');
        suiClient.walrus.certifyBlobTransaction({
          transaction: tx,
          certificate: uploaded.certificate,
          blobId: uploaded.blobId,
          blobObjectId: uploaded.blobObjectId,
          deletable: false,
        });
      },
      objectId() {
        if (!blobObjectId) throw new Error('upload must run before objectId');
        return blobObjectId;
      },
    };
  },
};
