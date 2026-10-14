# Art Tokenization on Sui

A decentralised platform for physical artworks on the Sui stack.

A research prototype live on Sui testnet: https://art-tokenization.duckdns.org

| Component                               | Where it runs                        | Directory          |
| --------------------------------------- | ------------------------------------ | ------------------ |
| Move package `art_tokenization`         | Sui validators                       | `smart-contracts/` |
| Web interface (React, Vite, TypeScript) | the browser, served as a Walrus Site | `frontend/`        |
| Report channel (Rust, Nautilus)         | an AWS Nitro Enclave                 | `enclave/`         |
| Deployment and operation scripts        | the operator's machine               | `scripts/`         |

```
Code/
  README.md            this file
  smart-contracts/     the Move package and its unit tests
  frontend/            the web interface (React, Vite)
  enclave/             the Nautilus enclave: Rust server, image build, host scripts
  scripts/             deployment and operation scripts, deployment.testnet.json
  source-simulator/    a desktop program that plays the external sources
  certificates/        the printable certificate of authenticity
  portal/              the Walrus Sites portal that serves the interface
```

## Installation, step by step

What gets installed, in this order:

1. the Move package `art_tokenization` on Sui testnet, with the shared objects it creates
2. the one-time chain setup: the demo registries, the royalty, the Display templates
3. the Nautilus enclave image, its measurements on chain, and the enclave itself on an EC2
   instance with Nitro Enclaves
4. the public entrance devices send their readings to
5. the web interface, first for development and then as a Walrus Site

The state of an installation lives in two files that the scripts write for you:
`scripts/deployment.testnet.json` (every id, address, digest and measurement) and
`frontend/src/config.ts` (the ids the interface reads). Unless a step says otherwise, run the
commands from `scripts/`. A whole installation costs about one SUI of testnet gas and takes
an afternoon, most of it waiting for the enclave image to build.

## 1. Tools

Install these on the machine you deploy from:

| Tool                          | Used for                                      | Install                          |
| ----------------------------- | --------------------------------------------- | -------------------------------- |
| `sui` 1.78 or newer           | publishing, every setup transaction           | `suiup install sui`              |
| `jq`                          | reading and writing `deployment.testnet.json` | package manager                  |
| `python3` with `cryptography` | device keys, signatures, the secrets file     | `pip install cryptography`       |
| `node` 22 or newer, `pnpm`    | the interface                                 | package manager, `npm i -g pnpm` |
| Docker                        | building the enclave image reproducibly       | Docker Desktop or the engine     |
| `site-builder`, `walrus`      | publishing the Walrus Site                    | Walrus docs                      |
| `ssh`, `scp`                  | the instance                                  | preinstalled                     |

Check them:

```
sui --version && jq --version && python3 -c "import cryptography" && node --version && pnpm --version && docker info >/dev/null && echo ok
```

## 2. Wallets and the deployment record

Every setup transaction is signed by the **authority**: the wallet that publishes the package
and holds the `AdminCap`. Create it in the local Sui keystore under the alias `authority`, on
testnet, and fund it. The publish costs about 0.3 SUI and the setup about as much again.

```
sui client switch --env testnet
sui client new-address ed25519 authority
sui client switch --address authority
sui client faucet
sui client gas
```

The demo needs a few more wallets. Create them the same way (any alias works but these are the
names the scripts and the interface expect):

- `gallery-a`, `gallery-b`: the two certified galleries
- `artist`, `investor-1`, `investor-2`: the roles of the walkthrough
- `enclave-payer`: the wallet you lend to the enclave to pay its gas. It only pays, every report
  is signed by the enclave's own key. Fund it with a few SUI.

The artist pays the Walrus storage of the artwork files in WAL, and anyone who extends that
storage later (owner, fraction holders, custodian gallery) pays in WAL too. Get testnet WAL for
`artist`, `investor-1` and `investor-2` with `walrus get-wal` (see the Walrus docs), and keep
some for `authority`, which pays the Walrus Site.

External sources are keypairs, not wallets. They hold no SUI and never talk to the chain.
Generate the demo source (art inspector) key:

```
channel/device.py generate inspector
```

Put your addresses in `scripts/deployment.testnet.json`. The file in the repository is the
record of the reference deployment the thesis describes (public ids, digests and measurements)
the publish step rewrites it but keeps `addresses` and `devices`, so replace those
two sections with your own before you publish. Take the addresses from `sui client addresses`
and the device address from the command above:

```json
{
  "network": "testnet",
  "addresses": {
    "authority": "0x...",
    "gallery-a": "0x...",
    "gallery-b": "0x...",
    "artist": "0x...",
    "investor-1": "0x...",
    "investor-2": "0x...",
    "enclave-payer": "0x..."
  },
  "devices": {
    "inspector": "0x..."
  }
}
```

## 3. Publish the Move package

Run the tests first. Then publish as the authority. The package bundles the Nautilus `enclave`
package as an unpublished dependency, so the flag is required. `Published.toml` must not exist
from an earlier deployment on the same network, otherwise the CLI treats the publish as an
upgrade.

```
cd ../smart-contracts
sui move test
rm -f Published.toml
sui client publish --with-unpublished-dependencies --json > ../scripts/logs/publish.testnet.json
cd ../scripts
chain/record-publish.sh
```

`record-publish.sh` reads the publish output and records the package id and every shared object
it created (catalogue, registries, parameters, counters, channel policy) in
`deployment.testnet.json`, and patches the same ids into `../frontend/src/config.ts`. It prints
the patched lines. Check that `sui client object <packageId>` answers.

## 4. One-time chain setup

Register the two galleries and the inspector, set the royalty, and register the Display
templates that make an artwork and a fraction legible in wallets and explorers. Two transactions,
both as the authority:

```
chain/setup-testnet.sh registries
chain/setup-testnet.sh display
chain/record-publish.sh display
```

These are **not idempotent**: `register` aborts on an entry that exists, and a second `display`
would mint a second pair of Display objects. Run each once. The defaults are a royalty of 400
basis points (4 %), the public Walrus aggregator, and the site URL
`https://art-tokenization.duckdns.org`; override them with the environment variables
`ROYALTY_BPS`, `AGGREGATOR` and `SITE`. The site URL can be corrected later with
`chain/update-site-url.sh <url>`.

## 5. Build the enclave image and record its measurements

The enclave image is built locally with Docker and the build is reproducible: the same source
gives the same image and the same measurements (PCRs), which is what the chain later checks.
With Docker running:

```
cd ../enclave
make ENCLAVE_APP=art-tokenization
cd ../scripts
enclave/enclave-setup.sh measure
```

The build takes five to ten minutes the first time and leaves `enclave/out/nitro.eif` and
`enclave/out/nitro.pcrs`. `measure` records the PCRs in `deployment.testnet.json` without a
transaction. In this image PCR0 equals PCR1 and PCR2 is a constant of the build pipeline.

Every change to the enclave's code changes PCR0. After a rebuild, run `measure` again and
declare the new values with `enclave/enclave-setup.sh pcrs` (step 6 covers the first
declaration).

## 6. Declare the measurements on chain

Create the enclave configuration: the object that holds the PCRs the authority trusts, and the
capability that lets the authority change them later.

```
enclave/enclave-setup.sh config
```

The call takes the channel policy recorded in step 3 and can run only once per publish: the
policy remembers the capability it created and refuses a second configuration. The image comes
before the configuration on purpose. A configuration created with zeros would
accept an enclave built in debug mode, whose measurements are zeros, from anyone. `config` refuses
to run if the recorded PCRs are not those of the local image. It records the config and cap ids
and patches them into `config.ts`.

## 7. The instance

The enclave runs on an EC2 instance with Nitro Enclaves. Once:

1. Launch an instance with Nitro Enclaves enabled (for example `m5.xlarge`, Amazon Linux 2023)
   and paste `scripts/enclave/ec2-user-data.sh` as its user data. It installs `nitro-cli`,
   Docker and `socat`, gives the allocator 3072 MiB, and starts the vsock proxy the enclave uses
   to reach Sui's GraphQL service, its only egress.
2. Give it an Elastic IP, so the address survives restarts.
3. In its security group allow ssh (22) from your IP, and 80 and 443 from anywhere for step 9.
4. Save the ssh key as `~/.ssh/nautilus-key.pem`.

Then, for every new image, copy the image and the host scripts, and hand over the secrets file.
`enclave-secrets.sh` builds it from `deployment.testnet.json` and the local keystore: the ids of
the installation and the seed of `enclave-payer`, sent over ssh from a mode-600 temporary file
and never stored in the repository.

```
scp -i ~/.ssh/nautilus-key.pem ../enclave/out/nitro.eif ../enclave/host-egress.sh \
    ../enclave/nautilus-enclave.sh ../enclave/nautilus-enclave.service ec2-user@IP:~/
enclave/enclave-secrets.sh IP enclave-payer
```

Install the enclave as a service, so it starts at boot, receives its secrets and gets its HTTP
face bridged to the loopback of the instance:

```
ssh -i ~/.ssh/nautilus-key.pem ec2-user@IP
  sudo install -m 755 nautilus-enclave.sh /usr/local/bin/nautilus-enclave.sh
  sudo install -m 644 nautilus-enclave.service /etc/systemd/system/nautilus-enclave.service
  sudo systemctl daemon-reload
  sudo systemctl enable --now nautilus-enclave
  nitro-cli describe-enclaves
  curl -s localhost:3000/status | jq
```

`describe-enclaves` must show the PCRs of `enclave/out/nitro.pcrs`. `/status` shows the payer
address, the window, the open windows and, within a minute of the first funding, the id of the
`Enclave` object the enclave registered itself as. To run it by hand instead of as a service:

```
  sh host-egress.sh
  nitro-cli run-enclave --cpu-count 2 --memory 1024 --eif-path nitro.eif
  sleep 5; socat - VSOCK-CONNECT:$(nitro-cli describe-enclaves | jq -r '.[0].EnclaveCID'):7777 < secrets.json
  socat TCP4-LISTEN:3000,bind=127.0.0.1,reuseaddr,fork VSOCK-CONNECT:$(nitro-cli describe-enclaves | jq -r '.[0].EnclaveCID'):3000 &
```

If the enclave does not register within two minutes, the usual causes are an unfunded
`enclave-payer` or PCRs that were not declared (steps 5 and 6).

## 8. Record and accept the enclave

Registration is permissionless: the attestation proves the code, and any copy of the image
measures the same, so it cannot say which deployment the platform stands behind. The authority
names it. Open an ssh tunnel to the enclave, record what it registered as, and accept it:

```
ssh -f -N -i ~/.ssh/nautilus-key.pem -L 3100:localhost:3000 ec2-user@IP
ENCLAVE_URL=http://localhost:3100 enclave/enclave-setup.sh record
enclave/enclave-setup.sh accept
```

From now on the channel records reports. The admin page of the interface shows the same
acceptance and offers it as a button, so after a restart of the instance you can accept the new
registration from the browser: every start of the enclave generates a new key and a new
`Enclave` object, and once accepted the enclave deletes the older registrations its wallet paid
for by itself.

## 9. The public entrance

Devices are not operators and have no ssh key, so the channel needs a public address. A reverse
proxy on the instance terminates TLS and forwards exactly one route, `POST /process_data`, to the
enclave; everything else stays behind ssh. You need a DNS name pointing at the Elastic IP (the
demo uses DuckDNS).

```
enclave/ingress.sh up IP channel.example.duckdns.org
enclave/enclave-setup.sh endpoint https://channel.example.duckdns.org
```

The second command publishes the address on chain, so a source needs nothing but the package id
to find the channel. `enclave/ingress.sh status` and `logs` check on the proxy.

## 10. The interface, and the first content

```
cd ../frontend
pnpm install
pnpm dev
```

Open `http://localhost:5173` and connect a Sui wallet (tested with Slush) holding the demo keys.
The catalogue is empty. Walk it through:

1. As the artist: **Έκδοση**, an image and the gallery to deliver to. The public image goes to
   Walrus, the full resolution is encrypted with Seal before it is stored. Three signatures:
   the storage registration (paid in WAL), the certification with the mint, and the attachment
   of the two `SharedBlob` objects to the artwork.
2. As gallery-a: **Γκαλερί**, record the intake, then issue the certificate. With a
   documentation file this is again three signatures: the file becomes a `SharedBlob` attached
   to the artwork's storage list, like the artist's files.
3. As the artist: **Χαρτοφυλάκιο**, fractionalize; list some fractions for sale.
4. As an investor: **Κατάλογος**, buy; the payment breakdown shows the royalty before signing.
5. As the authority: **Διοίκηση**, register a sensor as a source (its address comes from
   `channel/device.py generate sensor-hall-3`), check the enclave card.
6. Send readings: `../source-simulator/simulator.py` (a desktop program that plays the sources)
   or `channel/submit-report.sh read sensor-hall-3 --artwork <id> --condition 1`. A report
   appears on the artwork within one aggregation window (one minute by default).
7. Storage: **Χαρτοφυλάκιο → Αποθήκευση Walrus** (owner and fraction holders) and **Γκαλερί →
   Αποθήκευση Walrus** (custodian) list the artworks' files with their expiry epoch and extend
   them for WAL; anyone connected may pay, the payment stays in the `SharedBlob`. The list
   holds the public image, the encrypted full resolution and the certificate documentation.
8. Loss: as the custodian gallery, **Δήλωση απώλειας** on a fractionalised artwork; the holders
   then see the fractions marked as lost in **Τα κλάσματά μου** and can burn them.

## 11. The Walrus Site

The interface is published as a Walrus Site: its files live on Walrus, the object that describes
them lives on Sui. `site-builder` needs its configuration in `~/.config/walrus/sites-config.yaml`
(see the Walrus Sites docs) and the authority wallet, which pays the storage in WAL.

```
cd ../scripts
site/deploy-site.sh                 # builds the frontend and publishes dist/
```

The site object id is kept in `../frontend/public/ws-resources.json`, so every deploy updates the
same site. Testnet has no public portal that resolves Walrus Sites, so the platform runs its own:
`portal/` explains it and `portal/aws/` holds what runs at `https://art-tokenization.duckdns.org`.
If the site ends up under a different URL, `chain/update-site-url.sh <url>` rewrites the links
in the Display templates. The site's blobs belong to the authority and expire like any other;
**Διοίκηση → Walrus Site** lists them with their expiry and extends them for WAL.

## 12. Check

A working installation answers all of these:

- `sui client object $(jq -r .packageId deployment.testnet.json)` shows the package
- the transparency page of the interface lists two galleries and one source, and the enclave
  card shows an accepted enclave registered against the current configuration version
- `curl -s localhost:3100/status | jq .accepted_enclave` (through the tunnel) equals the id on
  that card
- `curl -s -o /dev/null -w '%{http_code}\n' https://<channel domain>/` answers 404, which is
  correct: only `POST /process_data` is served
- a reading sent from the simulator shows up as a report on the artwork's page

## Operating it

`scripts/README.md` covers the day to day: parameters, readings and reports, restarting the
enclave, the endpoint, upgrades. Each directory has its own README for what the piece does. The
thesis text is the reference for the design.

## Starting over

A fresh publish makes a new installation with an empty catalogue; the old one stays on the chain
but nothing here refers to it any more. Delete `smart-contracts/Published.toml`, keep
`deployment.testnet.json` (its `addresses` and `devices` carry over), and repeat from step 3. A
rebuilt enclave image needs steps 5 to 8 again; a restarted instance needs only step 8.
