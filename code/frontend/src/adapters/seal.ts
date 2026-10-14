import { SealClient, SessionKey, NoAccessError, ExpiredSessionKeyError } from '@mysten/seal';
import { Transaction } from '@mysten/sui/transactions';
import { fromHex, toHex } from '@mysten/sui/utils';
import { config } from '@/config';
import { dAppKit, suiClient } from './suiClient';

const sealClient = new SealClient({
  suiClient,
  serverConfigs: [...config.seal.servers],
  verifyKeyServers: false,
});

export function identityBytes(imageBlobId: string, salt: Uint8Array): Uint8Array {
  const image = new TextEncoder().encode(imageBlobId);
  const out = new Uint8Array(image.length + salt.length);
  out.set(image);
  out.set(salt, image.length);
  return out;
}

export function identityOf(imageBlobId: string, salt: Uint8Array): string {
  return toHex(identityBytes(imageBlobId, salt));
}

export function newSealSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

export async function encryptPrivate(
  imageBlobId: string,
  salt: Uint8Array,
  data: Uint8Array,
): Promise<Uint8Array> {
  const { encryptedObject } = await sealClient.encrypt({
    threshold: config.seal.threshold,
    packageId: config.packageId,
    id: identityOf(imageBlobId, salt),
    data,
  });
  return encryptedObject;
}

// The pending promise is cached, so two callers share one wallet prompt
const sessions = new Map<string, Promise<SessionKey>>();

export async function sessionKeyFor(
  address: string,
  onSign: () => void = () => {},
): Promise<SessionKey> {
  const pending = sessions.get(address);
  if (pending) {
    const cached = await pending.catch(() => null);
    if (cached && !cached.isExpired()) return cached;
    sessions.delete(address);
  }
  const created = (async () => {
    const key = await SessionKey.create({
      address,
      packageId: config.packageId,
      ttlMin: config.seal.sessionTtlMinutes,
      suiClient,
    });
    onSign();
    const { signature } = await dAppKit.signPersonalMessage({ message: key.getPersonalMessage() });
    await key.setPersonalMessageSignature(signature);
    return key;
  })();
  sessions.set(address, created);
  created.catch(() => sessions.delete(address));
  return created;
}

export type Requester = { kind: 'owner' } | { kind: 'holder'; fractionId: string };

export async function decryptPrivate(
  args: {
    address: string;
    artworkId: string;
    imageBlobId: string;
    sealSalt: string;
    blobId: string;
    requester: Requester;
  },
  onStep: (label: string) => void = () => {},
): Promise<Uint8Array> {
  onStep('Λήψη του κρυπτογραφημένου αρχείου από το Walrus…');
  const res = await fetch(config.walrus.url(args.blobId));
  if (!res.ok) throw new Error(`Ο aggregator απάντησε ${res.status}`);
  const data = new Uint8Array(await res.arrayBuffer());

  const sessionKey = await sessionKeyFor(args.address, () =>
    onStep('Κλειδί συνεδρίας: υπογραφή μηνύματος στο wallet (χωρίς συναλλαγή)…'),
  );

  onStep('Έλεγχος της πολιτικής από τους διακομιστές κλειδιών και λήψη των μεριδίων…');
  const tx = new Transaction();
  const id = tx.pure.vector('u8', identityBytes(args.imageBlobId, fromHex(args.sealSalt)));
  if (args.requester.kind === 'owner') {
    tx.moveCall({
      target: `${config.latestPackageId}::policy::seal_approve_full_res`,
      arguments: [id, tx.object(args.artworkId), tx.object(config.objects.catalog)],
    });
  } else {
    tx.moveCall({
      target: `${config.latestPackageId}::policy::seal_approve_full_res_holder`,
      arguments: [
        id,
        tx.object(args.artworkId),
        tx.object(config.objects.catalog),
        tx.object(args.requester.fractionId),
      ],
    });
  }
  const txBytes = await tx.build({ client: suiClient, onlyTransactionKind: true });
  try {
    onStep('Αποκρυπτογράφηση στον browser…');
    return await sealClient.decrypt({ data, sessionKey, txBytes });
  } catch (e) {
    if (e instanceof NoAccessError)
      throw new Error(
        'Οι key servers απέρριψαν το αίτημα: η πολιτική του έργου δεν σας δίνει πρόσβαση.',
        {
          cause: e,
        },
      );
    if (e instanceof ExpiredSessionKeyError) {
      sessions.delete(args.address);
      throw new Error('Το κλειδί συνεδρίας έληξε. Δοκιμάστε ξανά.', { cause: e });
    }
    throw e;
  }
}
