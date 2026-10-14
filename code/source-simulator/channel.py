from __future__ import annotations

import base64
import json
import urllib.error
import urllib.request

from keys import bcs_address

DEFAULT_GRAPHQL = "https://graphql.testnet.sui.io/graphql"

CONDITION_NAMES = ("ok", "damaged", "destroyed", "missing")

# Mirrors CHUNK in artwork.move: the catalog keeps its entries in chunks of this many
CATALOG_CHUNK = 100


class ChannelError(Exception):
    pass


def _post(url: str, body: dict, timeout: int) -> dict:
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={"content-type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        detail = error.read().decode(errors="replace")[:400]
        try:
            detail = json.loads(detail).get("error", detail)
        except ValueError:
            pass
        raise ChannelError(f"{error.code}: {detail}".strip()) from None
    except urllib.error.URLError as error:
        raise ChannelError(f"δεν υπάρχει σύνδεση ({error.reason})") from None
    except TimeoutError:
        raise ChannelError("δεν υπήρξε απάντηση εγκαίρως") from None


def send_reading(endpoint: str, request: dict, timeout: int = 20) -> dict:
    answer = _post(endpoint.rstrip("/") + "/process_data", request, timeout)
    if isinstance(answer, dict) and answer.get("error"):
        raise ChannelError(str(answer["error"]))
    return answer


class Chain:

    def __init__(self, graphql_url: str, package_id: str) -> None:
        self.url = graphql_url
        self.package = "0x" + bcs_address(package_id).hex()

    def query(
        self, query: str, variables: dict | None = None, timeout: int = 20
    ) -> dict:
        answer = _post(
            self.url, {"query": query, "variables": variables or {}}, timeout
        )
        if answer.get("errors"):
            raise ChannelError(
                str(answer["errors"][0].get("message", answer["errors"]))
            )
        return answer.get("data") or {}

    def _by_type(self, type_str: str) -> tuple[str, dict] | None:
        data = self.query(
            "query($t: String!) { objects(filter: {type: $t}) { nodes { address"
            " asMoveObject { contents { json } } } } }",
            {"t": type_str},
        )
        nodes = ((data.get("objects") or {}).get("nodes")) or []
        if not nodes:
            return None
        node = nodes[0]
        return node["address"], (
            ((node.get("asMoveObject") or {}).get("contents") or {}).get("json") or {}
        )

    def _object(self, object_id: str) -> dict:
        data = self.query(
            "query($id: SuiAddress!) { object(address: $id) { asMoveObject { contents { json } } } }",
            {"id": object_id},
        )
        return (
            ((data.get("object") or {}).get("asMoveObject") or {}).get("contents") or {}
        ).get("json") or {}

    def _field_u64(self, table_id: str, key: int):
        name_bcs = base64.b64encode(key.to_bytes(8, "little")).decode()
        data = self.query(
            "query($id: SuiAddress!, $bcs: Base64!) { address(address: $id) {"
            ' dynamicField(name: {type: "u64", bcs: $bcs}) { value { ... on MoveValue { json } } } } }',
            {"id": table_id, "bcs": name_bcs},
        )
        value = ((data.get("address") or {}).get("dynamicField") or {}).get("value")
        return (value or {}).get("json")

    def _field(self, table_id: str, address: str) -> dict | None:
        name_bcs = base64.b64encode(bcs_address(address)).decode()
        data = self.query(
            "query($id: SuiAddress!, $bcs: Base64!) { address(address: $id) {"
            ' dynamicField(name: {type: "address", bcs: $bcs}) { value { ... on MoveValue { json } } } } }',
            {"id": table_id, "bcs": name_bcs},
        )
        value = ((data.get("address") or {}).get("dynamicField") or {}).get("value")
        return (value or {}).get("json")

    # --- what a device asks ------------------------------------------------

    def policy(self) -> dict:
        found = self._by_type(f"{self.package}::report::ChannelPolicy")
        if not found:
            raise ChannelError("δεν βρέθηκε ChannelPolicy για αυτό το πακέτο")
        policy_id, json_ = found
        return {
            "id": policy_id,
            "endpoint": str(json_.get("endpoint") or ""),
            "windowMs": int(json_.get("window_ms") or 0),
            "acceptedEnclave": json_.get("accepted_enclave") or None,
        }

    def registry_entry(self, address: str) -> dict | None:
        found = self._by_type(
            f"{self.package}::registry::Registry<{self.package}::registry::Source>"
        )
        if not found:
            raise ChannelError("δεν βρέθηκε μητρώο πηγών για αυτό το πακέτο")
        table = (found[1].get("entries") or {}).get("id")
        if not table:
            return None
        return self._field(table, address)

    def activity(self, address: str) -> dict | None:
        found = self._by_type(f"{self.package}::report::ChannelStats")
        if not found:
            return None
        table = (found[1].get("by_source") or {}).get("id")
        if not table:
            return None
        return self._field(table, address)

    def artworks(self) -> list[dict]:
        found = self._by_type(f"{self.package}::artwork::Catalog")
        if not found:
            return []
        catalog = found[1]
        count = int(catalog.get("count") or 0)
        table = (catalog.get("chunks") or {}).get("id")
        if not count or not table:
            return []
        entries = []
        for chunk in range((count - 1) // CATALOG_CHUNK + 1):
            entries.extend(self._field_u64(table, chunk) or [])
        return [
            {
                "id": e.get("artwork"),
                "title": e.get("title") or "",
                "artist": e.get("artist_name") or "",
                "state": int(e.get("state") or 0),
            }
            for e in entries
            if e.get("artwork")
        ]

    def artwork(self, artwork_id: str) -> dict | None:
        json_ = self._object(artwork_id)
        return json_ or None

    def report_log(self, artwork_id: str) -> dict | None:
        data = self.query(
            "query($id: SuiAddress!, $type: String!) { object(address: $id) {"
            ' dynamicObjectField(name: {type: $type, bcs: "AA=="}) { value {'
            " ... on MoveObject { contents { json } } } } } }",
            {"id": artwork_id, "type": f"{self.package}::custody::CustodyKey"},
        )
        record = ((data.get("object") or {}).get("dynamicObjectField") or {}).get(
            "value"
        ) or {}
        record_json = ((record.get("contents") or {}).get("json")) or {}
        log_id = record_json.get("report_log")
        if not log_id:
            return None
        log = self._object(log_id)
        return {
            "id": log_id,
            "count": int(log.get("count") or 0),
            "lastCondition": int(log.get("last_condition") or 0),
            "lastAt": int(log.get("last_at") or 0),
            "notOk": int(log.get("not_ok") or 0),
        }
