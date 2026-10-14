"""The device side of the report channel: BCS encoding, keys, signed readings.

The bytes here are a contract with two other implementations, the enclave
(reading.rs) and the Move contract (report.move). `selftest` pins them.
"""

from __future__ import annotations

import hashlib
import os
import pathlib

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

ED25519_FLAG = 0x00

DEVICE_READING_DOMAIN = 1

CONDITIONS = ("Καλή κατάσταση", "Φθορά", "Καταστροφή", "Αγνοείται")

KEY_DIR = pathlib.Path(
    os.environ.get("DEVICE_KEY_DIR", pathlib.Path.home() / ".art-tokenization" / "devices")
)

def bcs_u8(n: int) -> bytes:
    return bytes([n])

def bcs_u64(n: int) -> bytes:
    return n.to_bytes(8, "little")

def bcs_address(value: str) -> bytes:
    hex_str = value.removeprefix("0x")
    if not hex_str or len(hex_str) > 64:
        raise ValueError(f"{value} is not a 32 byte hex address")
    return bytes.fromhex(f"{hex_str:0>64}")

def sui_address(public_key: bytes, flag: int = ED25519_FLAG) -> str:
    if len(public_key) != 32:
        raise ValueError("an ed25519 public key is 32 bytes")
    return "0x" + hashlib.blake2b(bytes([flag]) + public_key, digest_size=32).hexdigest()

def reading_bytes(artwork: str, condition: int, nonce: int, observed_at: int) -> bytes:
    return (
        bcs_u8(DEVICE_READING_DOMAIN)
        + bcs_address(artwork)
        + bcs_u8(condition)
        + bcs_u64(nonce)
        + bcs_u64(observed_at)
    )

class Source:

    def __init__(self, name: str, key: Ed25519PrivateKey) -> None:
        self.name = name
        self._key = key
        self.public_key = key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
        self.address = sui_address(self.public_key)

    def sign(self, artwork: str, condition: int, observed_at: int, nonce: int | None = None) -> dict:
        nonce = observed_at if nonce is None else nonce
        message = reading_bytes(artwork, condition, nonce, observed_at)
        return {
            "payload": {
                "public_key": self.public_key.hex(),
                "artwork": artwork,
                "condition": condition,
                "nonce": nonce,
                "observed_at": observed_at,
                "signature": self._key.sign(message).hex(),
            }
        }

def key_path(name: str) -> pathlib.Path:
    return KEY_DIR / f"{name}.key"

def names() -> list[str]:
    if not KEY_DIR.exists():
        return []
    return sorted(p.stem for p in KEY_DIR.glob("*.key"))

def load(name: str) -> Source:
    path = key_path(name)
    if not path.exists():
        raise FileNotFoundError(f"no key for {name!r}")
    return Source(name, Ed25519PrivateKey.from_private_bytes(bytes.fromhex(path.read_text().strip())))

def create(name: str) -> Source:
    path = key_path(name)
    if path.exists():
        raise FileExistsError(f"{path} already exists")
    KEY_DIR.mkdir(parents=True, exist_ok=True)
    key = Ed25519PrivateKey.generate()
    path.write_text(key.private_bytes_raw().hex() + "\n")
    path.chmod(0o600)
    return Source(name, key)

def selftest() -> None:
    seed = bytes([0x2A]) * 32
    source = Source("test", Ed25519PrivateKey.from_private_bytes(seed))
    assert source.public_key.hex() == (
        "197f6b23e16c8532c6abc838facd5ea789be0c76b2920334039bfa8b3d368d61"
    )
    assert source.address == "0x13054fec7a780ab44ad5b2207b67f6d7dcc8ffc334f7443037972ab7d3ecd510"
    message = reading_bytes(
        "0x01c5e4703d8ab941c77c53ac590c7764b9e6f197cd1bb6692613a1d3df9a2564", 1, 7, 1_700_000_000_000
    )
    assert message.hex() == (
        "0101c5e4703d8ab941c77c53ac590c7764b9e6f197cd1bb6692613a1d3df9a2564"
        "0107000000000000000068e5cf8b010000"
    ), message.hex()
    print("keys.py: encoder and address derivation agree with the reference vectors")

if __name__ == "__main__":
    selftest()
