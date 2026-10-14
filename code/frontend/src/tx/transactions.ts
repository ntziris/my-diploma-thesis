import { Transaction } from '@mysten/sui/transactions';
import type { Address, Mist, ObjectId, SourceKind, TxDigest } from '@/adapters';
import { chain, storage } from '@/adapters';
import { encryptPrivate, newSealSalt } from '@/adapters/seal';
import {
  extendOwned,
  fundAndExtendShared,
  shareBlob,
  walrusPackageId,
  type StoredBlob,
} from '@/adapters/walrusStorage';
import { config } from '@/config';
import { keywordsOf } from '@/lib/keywords';
import { errorMessage, explainFailure } from './errors';
import { execute } from './signer';

// Calls go to the latest package version; types keep the original id
const PKG = config.latestPackageId;
const CLOCK = '0x6';
const target = (module: string, fn: string) => `${PKG}::${module}::${fn}`;
const GALLERY_T = `${config.packageId}::registry::Gallery`;
const SOURCE_T = `${config.packageId}::registry::Source`;

export interface TxResult {
  digest: TxDigest;
}

async function mergedFraction(tx: Transaction, holder: Address, vaultId: ObjectId) {
  const mine = (await chain.listFractions(holder)).filter((f) => f.vaultId === vaultId);
  if (!mine.length) throw new Error('Δεν κατέχετε κλάσματα αυτού του έργου.');
  const [head, ...rest] = mine;
  const primary = tx.object(head.id);
  for (const f of rest) {
    tx.moveCall({ target: target('fraction', 'merge'), arguments: [primary, tx.object(f.id)] });
  }
  return { primary, amount: mine.reduce((sum, f) => sum + f.amount, 0) };
}

async function fractionalizedArtwork(artworkId: ObjectId) {
  const art = await chain.getArtwork(artworkId);
  if (!art) throw new Error('Το έργο δεν βρέθηκε.');
  if (!art.fractions) throw new Error('Το έργο δεν είναι κλασματοποιημένο.');
  return { art, vaultId: art.fractions.vaultId, total: art.fractions.total };
}

async function findListing(listingId: ObjectId) {
  const listing = await chain.getListing(listingId);
  if (!listing || !listing.active) throw new Error('Η αγγελία δεν είναι πλέον διαθέσιμη.');
  return listing;
}

export async function buyFractions(args: {
  buyer: Address;
  listingId: string;
  quantity: number;
}): Promise<TxResult> {
  const listing = await findListing(args.listingId);
  const total = BigInt(args.quantity) * listing.pricePerFraction;
  const tx = new Transaction();
  const [payment] = tx.splitCoins(tx.gas, [tx.pure.u64(total)]);
  tx.moveCall({
    target: target('market', 'buy'),
    arguments: [
      tx.object(listing.id),
      tx.object(listing.artworkId),
      tx.object(listing.vaultId),
      tx.object(config.objects.params),
      tx.object(config.objects.stats),
      tx.pure.u64(args.quantity),
      payment,
      tx.object(CLOCK),
    ],
  });
  return execute(tx);
}

export async function createListing(args: {
  seller: Address;
  artworkId: ObjectId;
  quantity: number;
  pricePerFraction: Mist;
}): Promise<TxResult> {
  const { vaultId } = await fractionalizedArtwork(args.artworkId);
  const tx = new Transaction();
  const { primary, amount } = await mergedFraction(tx, args.seller, vaultId);
  if (args.quantity <= 0 || args.quantity > amount)
    throw new Error('Η ποσότητα υπερβαίνει τα κλάσματα που κατέχετε.');
  tx.moveCall({
    target: target('market', 'list'),
    arguments: [
      tx.object(args.artworkId),
      tx.object(vaultId),
      primary,
      tx.pure.u64(args.quantity),
      tx.pure.u64(args.pricePerFraction),
      tx.object(config.objects.stats),
      tx.object(CLOCK),
    ],
  });
  return execute(tx);
}

export async function cancelListing(args: {
  seller: Address;
  listingId: string;
}): Promise<TxResult> {
  const listing = await findListing(args.listingId);
  const tx = new Transaction();
  tx.moveCall({
    target: target('market', 'cancel'),
    arguments: [
      tx.object(listing.id),
      tx.object(listing.artworkId),
      tx.object(listing.vaultId),
      tx.object(config.objects.stats),
      tx.object(CLOCK),
    ],
  });
  return execute(tx);
}

export async function fractionalize(args: {
  artist: Address;
  artworkId: ObjectId;
  total: number;
}): Promise<TxResult> {
  if (args.total <= 0) throw new Error('Το πλήθος κλασμάτων πρέπει να είναι θετικό.');
  const tx = new Transaction();
  tx.moveCall({
    target: target('fraction', 'fractionalize'),
    arguments: [
      tx.object(args.artworkId),
      tx.pure.u64(args.total),
      tx.object(config.objects.catalog),
      tx.object(config.objects.stats),
      tx.object(CLOCK),
    ],
  });
  return execute(tx);
}

export async function consolidate(args: {
  holder: Address;
  artworkId: ObjectId;
}): Promise<TxResult> {
  const { vaultId, total } = await fractionalizedArtwork(args.artworkId);
  const tx = new Transaction();
  const { primary, amount } = await mergedFraction(tx, args.holder, vaultId);
  if (amount < total) throw new Error('Απαιτείται το 100% των κλασμάτων.');
  tx.moveCall({
    target: target('fraction', 'consolidate'),
    arguments: [
      tx.object(args.artworkId),
      tx.object(vaultId),
      primary,
      tx.object(config.objects.catalog),
      tx.object(config.objects.stats),
      tx.object(CLOCK),
    ],
  });
  return execute(tx);
}

export function createMintArtwork(
  args: {
    artist: Address;
    artistName: string;
    title: string;
    year: string;
    medium: string;
    dimensions: string;
    description: string;
    preview: File;
    hires: File | null;
    intendedGallery: { address: Address; name: string };
  },
  onStep: (label: string) => void = () => {},
): () => Promise<TxResult & { artworkId: ObjectId; storageError: string | null }> {
  let prepared: {
    image: ReturnType<typeof storage.blob>;
    imageBlobId: string;
    hires: ReturnType<typeof storage.blob> | null;
    hiresBlobId: string;
    sealSalt: Uint8Array;
  } | null = null;
  let imageRegistered: Awaited<ReturnType<typeof execute>> | null = null;
  let hiresRegistered: Awaited<ReturnType<typeof execute>> | null = null;
  let imageUploaded = false;
  let hiresUploaded = false;
  let minted: Awaited<ReturnType<typeof execute>> | null = null;

  return async () => {
    if (!prepared) {
      onStep('Κωδικοποίηση της δημόσιας εικόνας για το Walrus…');
      const image = storage.blob(args.preview);
      const imageBlobId = await image.encode();
      const sealSalt = newSealSalt();
      let hires: ReturnType<typeof storage.blob> | null = null;
      let hiresBlobId = '';
      if (args.hires) {
        onStep('Κρυπτογράφηση της υψηλής ανάλυσης με Seal, υπό την πολιτική του έργου…');
        const ciphertext = await encryptPrivate(
          imageBlobId,
          sealSalt,
          new Uint8Array(await args.hires.arrayBuffer()),
        );
        hires = storage.blob(ciphertext);
        hiresBlobId = await hires.encode();
      }
      prepared = { image, imageBlobId, hires, hiresBlobId, sealSalt };
    }

    const { image, imageBlobId, hires, hiresBlobId, sealSalt } = prepared;
    if (!imageRegistered) {
      onStep('Υπογραφή: καταχώριση της δημόσιας εικόνας στο Walrus…');
      imageRegistered = await execute(image.register(args.artist));
    }
    if (hires && !hiresRegistered) {
      onStep('Υπογραφή: καταχώριση της υψηλής ανάλυσης στο Walrus…');
      hiresRegistered = await execute(hires.register(args.artist));
    }

    if (!imageUploaded) {
      onStep('Αποστολή της δημόσιας εικόνας στο Walrus…');
      await image.upload(imageRegistered.digest, imageRegistered.created);
      imageUploaded = true;
    }
    if (hires && !hiresUploaded) {
      onStep('Αποστολή της υψηλής ανάλυσης στο Walrus…');
      if (!hiresRegistered) throw new Error('Η υψηλή ανάλυση δεν έχει καταχωριστεί στο Walrus.');
      await hires.upload(hiresRegistered.digest, hiresRegistered.created);
      hiresUploaded = true;
    }

    if (!minted) {
      onStep('Υπογραφή: πιστοποίηση της αποθήκευσης και έκδοση του έργου…');
      const walrusPkg = await walrusPackageId();
      const tx = new Transaction();
      await image.certify(tx);
      shareBlob(tx, walrusPkg, image.objectId());
      if (hires) {
        await hires.certify(tx);
        shareBlob(tx, walrusPkg, hires.objectId());
      }
      tx.moveCall({
        target: target('artwork', 'mint'),
        arguments: [
          tx.object(config.objects.catalog),
          tx.object(config.objects.galleryRegistry),
          tx.pure.string(args.title),
          tx.pure.string(args.artistName),
          tx.pure.string(args.year),
          tx.pure.string(args.medium),
          tx.pure.string(args.dimensions),
          tx.pure.string(args.description),
          tx.pure.string(imageBlobId),
          tx.pure.string(hiresBlobId),
          tx.pure.vector('u8', sealSalt),
          tx.pure.address(args.intendedGallery.address),
          tx.pure.vector('string', keywordsOf(args.title, args.artistName, args.year, args.medium)),
          tx.object(CLOCK),
        ],
      });
      minted = await execute(tx);
    }

    const artworkId =
      minted.created.find((o) => o.type.endsWith('::artwork::Artwork'))?.objectId ?? '';
    const shared = minted.created
      .filter((o) => o.type.endsWith('::shared_blob::SharedBlob'))
      .map((o) => o.objectId);

    // The artwork exists from here on; a failed attachment is reported, not fatal.
    let storageError: string | null = null;
    if (artworkId && shared.length) {
      onStep('Υπογραφή: σύνδεση της αποθήκευσης με το έργο…');
      try {
        await attachStorage(artworkId, shared);
      } catch (e) {
        storageError = explainFailure(errorMessage(e)) || 'Η σύνδεση της αποθήκευσης απέτυχε.';
      }
    }
    return { digest: minted.digest, artworkId, storageError };
  };
}

export async function attachStorage(artworkId: ObjectId, ids: ObjectId[]): Promise<TxResult> {
  if (!ids.length) throw new Error('Δεν υπάρχουν αντικείμενα αποθήκευσης προς σύνδεση.');
  const tx = new Transaction();
  tx.moveCall({
    target: target('custody', 'attach_storage'),
    arguments: [
      tx.object(artworkId),
      tx.object(config.objects.galleryRegistry),
      tx.pure.vector('id', ids),
    ],
  });
  return execute(tx);
}

// A holding may be several Fraction objects; all of them go in one transaction
export async function burnFractions(args: {
  fractionIds: ObjectId[];
  artworkId: ObjectId;
}): Promise<TxResult> {
  if (!args.fractionIds.length) throw new Error('Δεν υπάρχει κλάσμα προς διαγραφή.');
  const tx = new Transaction();
  for (const id of args.fractionIds) {
    tx.moveCall({
      target: target('fraction', 'burn'),
      arguments: [tx.object(id), tx.object(args.artworkId)],
    });
  }
  return execute(tx);
}

// The cost shown to the user is the amount funded, so the two never drift apart
export async function extendStorage(args: {
  blob: StoredBlob;
  epochs: number;
  frost: bigint;
}): Promise<TxResult> {
  if (!Number.isInteger(args.epochs) || args.epochs <= 0)
    throw new Error('Το πλήθος των epoch πρέπει να είναι θετικός ακέραιος.');
  const tx = new Transaction();
  if (args.blob.shared) await fundAndExtendShared(tx, args.blob, args.epochs, args.frost);
  else await extendOwned(tx, args.blob, args.epochs);
  return execute(tx);
}

export async function reassignCustody(args: {
  artworkId: ObjectId;
  gallery: Address;
  galleryName: string;
}): Promise<TxResult> {
  const tx = new Transaction();
  tx.moveCall({
    target: target('custody', 'reassign'),
    arguments: [
      tx.object(args.artworkId),
      tx.object(config.objects.adminCap),
      tx.object(config.objects.galleryRegistry),
      tx.object(config.objects.catalog),
      tx.pure.address(args.gallery),
      tx.object(CLOCK),
    ],
  });
  return execute(tx);
}

export async function custodyIntake(args: {
  gallery: Address;
  galleryName: string;
  artworkId: ObjectId;
}): Promise<TxResult> {
  const tx = new Transaction();
  tx.moveCall({
    target: target('custody', 'record_custody'),
    arguments: [
      tx.object(args.artworkId),
      tx.object(config.objects.galleryRegistry),
      tx.object(config.objects.catalog),
      tx.object(CLOCK),
    ],
  });
  return execute(tx);
}

export function createIssueCertificate(
  args: {
    gallery: Address;
    galleryName: string;
    artworkId: ObjectId;
    statement: string;
    documentation?: File | null;
  },
  onStep: (label: string) => void = () => {},
): () => Promise<TxResult & { storageError: string | null }> {
  let doc: ReturnType<typeof storage.blob> | null = null;
  let documentationBlobId = '';
  let registered: Awaited<ReturnType<typeof execute>> | null = null;
  let uploaded = false;
  let issued: Awaited<ReturnType<typeof execute>> | null = null;

  return async () => {
    if (args.documentation && !doc) {
      onStep('Κωδικοποίηση της τεκμηρίωσης για το Walrus…');
      doc = storage.blob(args.documentation);
      documentationBlobId = await doc.encode();
    }
    if (doc && !registered) {
      onStep('Υπογραφή: καταχώριση της τεκμηρίωσης στο Walrus…');
      registered = await execute(doc.register(args.gallery));
    }
    if (doc && registered && !uploaded) {
      onStep('Αποστολή της τεκμηρίωσης στο Walrus…');
      await doc.upload(registered.digest, registered.created);
      uploaded = true;
    }

    if (!issued) {
      const tx = new Transaction();
      if (doc) {
        onStep('Υπογραφή: πιστοποίηση της αποθήκευσης και έκδοση του πιστοποιητικού…');
        await doc.certify(tx);
        shareBlob(tx, await walrusPackageId(), doc.objectId());
      } else {
        onStep('Υπογραφή 1 από 1: έκδοση του πιστοποιητικού…');
      }
      tx.moveCall({
        target: target('certificate', 'issue'),
        arguments: [
          tx.object(args.artworkId),
          tx.object(config.objects.galleryRegistry),
          tx.object(config.objects.catalog),
          tx.pure.string(args.statement),
          tx.pure.string(documentationBlobId),
          tx.object(CLOCK),
        ],
      });
      issued = await execute(tx);
    }

    const shared = issued.created
      .filter((o) => o.type.endsWith('::shared_blob::SharedBlob'))
      .map((o) => o.objectId);
    let storageError: string | null = null;
    if (shared.length) {
      onStep('Υπογραφή: σύνδεση της τεκμηρίωσης με το έργο…');
      try {
        await attachStorage(args.artworkId, shared);
      } catch (e) {
        storageError = explainFailure(errorMessage(e)) || 'Η σύνδεση της αποθήκευσης απέτυχε.';
      }
    }
    return { digest: issued.digest, storageError };
  };
}

export async function declareLoss(args: {
  gallery: Address;
  artworkId: ObjectId;
  reportId?: ObjectId;
  reason: string;
}): Promise<TxResult> {
  const tx = new Transaction();
  tx.moveCall({
    target: target('custody', 'report_loss'),
    arguments: [
      tx.object(args.artworkId),
      tx.object(config.objects.galleryRegistry),
      tx.object(config.objects.catalog),
      tx.object(config.objects.stats),
      tx.pure.option('id', args.reportId ?? null),
      tx.pure.string(args.reason),
      tx.object(CLOCK),
    ],
  });
  return execute(tx);
}

export async function requestRedemption(args: {
  owner: Address;
  artworkId: ObjectId;
  note: string;
}): Promise<TxResult> {
  const tx = new Transaction();
  tx.moveCall({
    target: target('custody', 'redeem_request'),
    arguments: [tx.object(args.artworkId), tx.pure.string(args.note), tx.object(CLOCK)],
  });
  return execute(tx);
}

export async function withdrawRedemption(args: {
  owner: Address;
  artworkId: ObjectId;
}): Promise<TxResult> {
  const tx = new Transaction();
  tx.moveCall({
    target: target('custody', 'redeem_withdraw'),
    arguments: [tx.object(args.artworkId), tx.object(CLOCK)],
  });
  return execute(tx);
}

export async function confirmRedemption(args: {
  gallery: Address;
  artworkId: ObjectId;
}): Promise<TxResult> {
  const tx = new Transaction();
  tx.moveCall({
    target: target('custody', 'redeem_confirm'),
    arguments: [
      tx.object(args.artworkId),
      tx.object(config.objects.galleryRegistry),
      tx.object(config.objects.catalog),
      tx.object(CLOCK),
    ],
  });
  return execute(tx);
}

export async function cancelMint(args: {
  artist: Address;
  artworkId: ObjectId;
}): Promise<TxResult> {
  const tx = new Transaction();
  tx.moveCall({
    target: target('artwork', 'cancel_mint'),
    arguments: [tx.object(args.artworkId), tx.object(config.objects.catalog), tx.object(CLOCK)],
  });
  return execute(tx);
}

export async function registerGallery(args: { address: Address; name: string }): Promise<TxResult> {
  return registerEntity(GALLERY_T, config.objects.galleryRegistry, args.address, args.name, '');
}

export async function revokeGallery(address: Address): Promise<TxResult> {
  return revokeEntity(GALLERY_T, config.objects.galleryRegistry, address);
}

export async function registerSource(args: {
  address: Address;
  name: string;
  kind: SourceKind;
}): Promise<TxResult> {
  return registerEntity(
    SOURCE_T,
    config.objects.sourceRegistry,
    args.address,
    args.name,
    args.kind,
  );
}

export async function revokeSource(address: Address): Promise<TxResult> {
  return revokeEntity(SOURCE_T, config.objects.sourceRegistry, address);
}

async function registerEntity(
  typeArg: string,
  registry: ObjectId,
  who: Address,
  name: string,
  kind: string,
): Promise<TxResult> {
  const tx = new Transaction();
  tx.moveCall({
    target: target('registry', 'register'),
    typeArguments: [typeArg],
    arguments: [
      tx.object(registry),
      tx.object(config.objects.adminCap),
      tx.pure.address(who),
      tx.pure.string(name),
      tx.pure.string(kind),
      tx.object(CLOCK),
    ],
  });
  return execute(tx);
}

async function revokeEntity(typeArg: string, registry: ObjectId, who: Address): Promise<TxResult> {
  const tx = new Transaction();
  tx.moveCall({
    target: target('registry', 'revoke'),
    typeArguments: [typeArg],
    arguments: [
      tx.object(registry),
      tx.object(config.objects.adminCap),
      tx.pure.address(who),
      tx.object(CLOCK),
    ],
  });
  return execute(tx);
}

export async function updatePcrs(pcr0: string, pcr1: string, pcr2: string): Promise<TxResult> {
  const bytes = (hex: string) => {
    const h = hex.trim().toLowerCase().replace(/^0x/, '');
    if (!/^[0-9a-f]{96}$/.test(h))
      throw new Error('Κάθε PCR είναι 48 bytes σε δεκαεξαδική μορφή (96 χαρακτήρες).');
    return Array.from({ length: 48 }, (_, i) => parseInt(h.slice(2 * i, 2 * i + 2), 16));
  };
  const tx = new Transaction();
  tx.moveCall({
    target: target('enclave', 'update_pcrs'),
    typeArguments: [`${PKG}::report::ReportChannel`],
    arguments: [
      tx.object(config.enclave.configId),
      tx.object(config.enclave.capId),
      tx.pure.vector('u8', bytes(pcr0)),
      tx.pure.vector('u8', bytes(pcr1)),
      tx.pure.vector('u8', bytes(pcr2)),
    ],
  });
  return execute(tx);
}

export async function acceptEnclave(enclaveId: ObjectId): Promise<TxResult> {
  const tx = new Transaction();
  tx.moveCall({
    target: target('report', 'accept_enclave'),
    arguments: [
      tx.object(config.objects.channelPolicy),
      tx.object(config.objects.adminCap),
      tx.object(enclaveId),
      tx.object(config.enclave.configId),
      tx.object(CLOCK),
    ],
  });
  return execute(tx);
}

export async function clearEnclave(): Promise<TxResult> {
  const tx = new Transaction();
  tx.moveCall({
    target: target('report', 'clear_enclave'),
    arguments: [
      tx.object(config.objects.channelPolicy),
      tx.object(config.objects.adminCap),
      tx.object(CLOCK),
    ],
  });
  return execute(tx);
}

export async function setEndpoint(url: string): Promise<TxResult> {
  const value = url.trim();
  if (value.length > 256)
    throw new Error('Το σημείο εισόδου δεν μπορεί να ξεπερνά τους 256 χαρακτήρες.');
  if (value && !/^https:\/\/[^\s]+$/.test(value))
    throw new Error('Δώστε πλήρη διεύθυνση https, ή αφήστε το κενό για να αποσυρθεί.');
  const tx = new Transaction();
  tx.moveCall({
    target: target('report', 'set_endpoint'),
    arguments: [
      tx.object(config.objects.channelPolicy),
      tx.object(config.objects.adminCap),
      tx.pure.string(value),
      tx.object(CLOCK),
    ],
  });
  return execute(tx);
}

export async function updateWindow(newMs: number): Promise<TxResult> {
  if (!Number.isInteger(newMs) || newMs < 1_000 || newMs > 86_400_000)
    throw new Error('Το παράθυρο πρέπει να είναι από 1 δευτερόλεπτο έως 24 ώρες.');
  const tx = new Transaction();
  tx.moveCall({
    target: target('report', 'set_window_ms'),
    arguments: [
      tx.object(config.objects.channelPolicy),
      tx.object(config.objects.adminCap),
      tx.pure.u64(newMs),
      tx.object(CLOCK),
    ],
  });
  return execute(tx);
}

export async function updateRoyalty(newBps: number): Promise<TxResult> {
  if (!Number.isInteger(newBps) || newBps < 0 || newBps > 10_000)
    throw new Error('Το ποσοστό πρέπει να είναι ακέραιος από 0 έως 10000 μονάδες βάσης.');
  const tx = new Transaction();
  tx.moveCall({
    target: target('admin', 'set_royalty_bps'),
    arguments: [
      tx.object(config.objects.params),
      tx.object(config.objects.adminCap),
      tx.pure.u64(newBps),
      tx.object(CLOCK),
    ],
  });
  return execute(tx);
}
