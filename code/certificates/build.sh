#!/usr/bin/env bash
# Usage: ./build.sh data/<id>.json [out/<id>.pdf]
# Usage: ./build.sh data/<id>.json --findings "Η εξέταση περιέλαβε ..."
# The json comes from fetch-artwork.mjs
# Without --findings it asks, and without an answer it writes default_findings
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
default_findings="Πρωτότυπη έκδοση."
data=${1:?data json, e.g. data/1a2b3c4d.json}
shift
out=""
findings=""
while [ $# -gt 0 ]; do
	case "$1" in
	--findings)
		findings=$2
		shift 2
		;;
	*)
		out=$1
		shift
		;;
	esac
done

# arguments are read against the caller's directory, typst against the template's
case "$data" in /*) ;; *) data="$PWD/$data" ;; esac
case "$out" in "" | /*) ;; *) out="$PWD/$out" ;; esac
cd "$here"
rel=${data#"$here"/}
case "$rel" in /*)
	echo "το $data είναι έξω από το $here" >&2
	exit 1
	;;
esac
out=${out:-out/$(basename "$data" .json).pdf}
mkdir -p "$(dirname "$out")"

if grep -q '\[Συμπληρώστε' "$data"; then
	if [ -z "$findings" ]; then
		echo "Η δήλωση του $data δεν έχει ακόμη τα ευρήματα της εξέτασης."
		echo "Γράψτε τα (μία ή περισσότερες γραμμές, κενή γραμμή για τέλος):"
		findings=""
		while IFS= read -r line; do
			[ -z "$line" ] && break
			findings="${findings:+$findings }$line"
		done
		if [ -z "$findings" ]; then
			findings=$default_findings
			echo "Δεν δόθηκαν ευρήματα, μπαίνει η προεπιλογή: $findings"
		fi
	fi
	FINDINGS="$findings" python3 - "$data" <<'PY'
import json, os, re, sys
path = sys.argv[1]
d = json.load(open(path, encoding="utf-8"))
findings = " " + os.environ["FINDINGS"].strip()
d["statement"] = re.sub(r"\s*\[Συμπληρώστε[^\]]*\]", lambda _: findings, d["statement"]).strip()
json.dump(d, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
open(path, "a", encoding="utf-8").write("\n")
print("-> τα ευρήματα γράφτηκαν στο", path)
PY
fi

typst compile --input "data=$rel" certificate.typ "$out"
echo "-> $out"
