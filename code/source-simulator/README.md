# Source simulator

A desktop bench that simulates the external sources of the report channel:
it creates devices, signs their readings and posts them to the channel, then
looks up on the chain what became of them.

It is a **separate program**. It is not part of the deployment, it is not run
during installation, and it writes nothing into the repository. It holds no
wallet, signs no transaction and needs neither the Sui CLI nor
`deployment.testnet.json`. Everything it knows, it knows the way a real device
would.

## What it does, and why in this order

1. **Provisioned with a package id.** The one value a device is given. It is the
   *original* package id, the one an upgrade never changes (`packageId` in the
   deployment record, not `latestPackageId`), because every lookup below is by
   object type and a type keeps the address of the version that declared it.
2. **Reads the channel from the chain.** The endpoint the authority published,
   the aggregation window, and which enclave the authority accepts. All of it
   is found from the package id alone, by object type.
3. **Holds a key.** `Νέα πηγή` generates an Ed25519 keypair under
   `~/.art-tokenization/devices/`, outside any repository. The address is
   `blake2b256(0x00 || public key)`; the authority registers it from the admin
   page, and until it does, the enclave refuses the device's readings.
4. **Signs and posts a reading.** Artwork, condition, sequence number and time
   of observation, in BCS, signed. The sequence number *is* the observation
   time: it only has to increase, and a clock does that by itself, so a device
   that is reset keeps working without remembering anything.
5. **Verifies from the chain, not from the wire.** The card at the bottom right
   reads the artwork's report log and the source's own counters. A reading that
   was accepted by the channel but never became a report is visible as exactly
   that.

The four conditions are the ones the contract knows: καλή κατάσταση, φθορά,
καταστροφή, αγνοείται. The report the enclave signs carries the prevailing one
of the whole window, so send several readings (there is a `κάθε N δευτερόλεπτα`
switch for that) and watch one report come out of them.

The observation-time offsets are there to try the rules on purpose: a reading
older than ten minutes, or more than a minute ahead of the enclave's clock, is
refused.

## Running it

```
python3 simulator.py [--package 0x…] [--node https://graphql.testnet.sui.io/graphql]
```

Requirements: Python 3.11+, `cryptography` (for Ed25519), and Tkinter. On Arch
and derivatives Tkinter needs the `tk` package (`sudo pacman -S tk`); the Python
module is in the standard library but the Tcl/Tk shared library is not.

`python3 keys.py` runs the encoder's self-test on its own: it pins the BCS
layout and the address derivation to the same reference vectors the Move tests
and the enclave carry. If it fails, the three no longer mean the same bytes.

## When the chain cannot answer

A device sends where the authority says, and the window has no setting for it.
Two moments are not like that: before an endpoint has been published, and while
the enclave is reached through an ssh tunnel during development. Both are
`--endpoint`:

```
python3 simulator.py --endpoint http://localhost:3000
```

## Files

```
keys.py        what a source is: BCS, address derivation, the key store, signing
channel.py     the outside world: GraphQL reads of the chain, one POST to the channel
simulator.py   the interface, in the platform's own palette
```
