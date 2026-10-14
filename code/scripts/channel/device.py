#!/usr/bin/env python3
"""The external source: makes a device key, signs a reading, verifies one."""

import argparse
import json
import os
import pathlib
import sys
import time

from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from suibcs import bcs_address, bcs_u8, bcs_u64, sui_address  # noqa: E402

KEY_DIR = pathlib.Path(
    os.environ.get("DEVICE_KEY_DIR", pathlib.Path.home() / ".art-tokenization" / "devices")
)

DEVICE_READING_DOMAIN = 1

def key_path(name: str) -> pathlib.Path:
    return KEY_DIR / f"{name}.key"

def load(name: str) -> Ed25519PrivateKey:
    path = key_path(name)
    if not path.exists():
        raise SystemExit(f"no key for {name!r}: run `channel/device.py generate {name}` first")
    return Ed25519PrivateKey.from_private_bytes(bytes.fromhex(path.read_text().strip()))

def public_bytes(key: Ed25519PrivateKey) -> bytes:
    return key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)

def reading_bytes(artwork: str, condition: int, nonce: int, observed_at: int) -> bytes:
    return (
        bcs_u8(DEVICE_READING_DOMAIN)
        + bcs_address(artwork)
        + bcs_u8(condition)
        + bcs_u64(nonce)
        + bcs_u64(observed_at)
    )

def cmd_generate(args) -> None:
    path = key_path(args.name)
    if path.exists() and not args.force:
        raise SystemExit(f"{path} already exists, pass --force to replace it")
    KEY_DIR.mkdir(parents=True, exist_ok=True)
    key = Ed25519PrivateKey.generate()
    path.write_text(key.private_bytes_raw().hex() + "\n")
    path.chmod(0o600)
    print(f"key      {path}")
    print(f"address  {sui_address(public_bytes(key))}")
    print()
    print("Register this address as a source from the admin page. It holds no SUI")
    print("and never will.")

def cmd_address(args) -> None:
    print(sui_address(public_bytes(load(args.name))))

def cmd_sign(args) -> None:
    key = load(args.name)
    pk = public_bytes(key)
    observed_at = args.observed_at if args.observed_at is not None else int(time.time() * 1000)
    nonce = args.nonce if args.nonce is not None else observed_at
    message = reading_bytes(args.artwork, args.condition, nonce, observed_at)
    request = {
        "payload": {
            "public_key": pk.hex(),
            "artwork": args.artwork,
            "condition": args.condition,
            "nonce": nonce,
            "observed_at": observed_at,
            "signature": key.sign(message).hex(),
        }
    }
    if args.verbose:
        print(f"# source  {sui_address(pk)}", file=sys.stderr)
        print(f"# signed  {message.hex()}", file=sys.stderr)
    print(json.dumps(request, indent=2))

def cmd_verify(args) -> None:
    request = json.load(sys.stdin)["payload"]
    pk = bytes.fromhex(request["public_key"])
    message = reading_bytes(
        request["artwork"],
        request["condition"],
        request["nonce"],
        request["observed_at"],
    )
    Ed25519PublicKey.from_public_bytes(pk).verify(bytes.fromhex(request["signature"]), message)
    print(f"signature ok, source is {sui_address(pk)}")

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest="cmd", required=True)

    g = sub.add_parser("generate", help="create a device keypair")
    g.add_argument("name")
    g.add_argument("--force", action="store_true")
    g.set_defaults(func=cmd_generate)

    a = sub.add_parser("address", help="print the registry identity of a device")
    a.add_argument("name")
    a.set_defaults(func=cmd_address)

    s = sub.add_parser("sign", help="sign one reading, ready to POST to the enclave")
    s.add_argument("name")
    s.add_argument("--artwork", required=True)
    s.add_argument("--condition", type=int, required=True,
                   help="0 ok, 1 damaged, 2 destroyed, 3 missing")
    s.add_argument("--nonce", type=int, default=None,
                   help="strictly increasing per device; the enclave drops repeats "
                        "(default: the observation time in ms)")
    s.add_argument("--observed-at", type=int, default=None,
                   help="time of the observation in ms since the epoch (default: now)")
    s.add_argument("-v", "--verbose", action="store_true")
    s.set_defaults(func=cmd_sign)

    v = sub.add_parser("verify", help="verify a signed reading read from stdin")
    v.set_defaults(func=cmd_verify)

    args = ap.parse_args()
    args.func(args)

if __name__ == "__main__":
    main()
