#!/usr/bin/env bash
# Reproduces every number in REPORT.md. Needs: bun, node, cargo, hyperfine, python3.
set -euo pipefail
cd "$(dirname "$0")"
ROOT=../..
U=http://127.0.0.1:8765
RS=rust/target/release/into-md-rs
mkdir -p results/raw fixtures
[ -f fixtures/xlarge-wiki.html ] || ./fetch-fixtures.sh
(cd "$ROOT" && bun install && bun run build && bun add --no-save linkedom)
(cd rust && cargo build --release)

python3 -m http.server 8765 --directory fixtures >/dev/null 2>&1 &
SERVER=$!; trap 'kill $SERVER' EXIT; sleep 1

echo "== in-process stage timings"
bun run bench-ts.ts 15 | tail -1 > results/raw/stages-ts-bun.json
bun run bench-ts-linkedom.ts 15 | tail -1 > results/raw/stages-ts-linkedom.json
for f in fixtures/*.html; do echo "$(basename "$f" .html) $($RS --file "$f" --repeat 15 2>/dev/null)"; done > results/raw/stages-rust.txt

echo "== parity"
for f in fixtures/*.html; do n=$(basename "$f" .html)
  bun run dump-ts.ts "$f" > "results/raw/$n.ts.md"
  $RS --file "$f" 2>/dev/null | awk 'c>=2{print} /^---$/{c++}' > "results/raw/$n.rs.md"
done
python3 parity.py | tee results/parity.txt

echo "== CLI startup + end-to-end"
hyperfine -N -w 2 -r 10 --export-markdown results/startup.md \
  -n "ts (node dist)" "node $ROOT/dist/index.mjs --version" \
  -n "ts (bun src)" "bun run $ROOT/src/index.ts --version" \
  -n rust "$RS --help"
for f in small-hn medium-essay large-mdn xlarge-wiki; do
  hyperfine -w 1 -r 8 --export-markdown "results/e2e-$f.md" \
    -n "ts (node dist)" "node $ROOT/dist/index.mjs $U/$f.html --no-cache -o /dev/null" \
    -n "ts (bun src)" "bun run $ROOT/src/index.ts $U/$f.html --no-cache -o /dev/null" \
    -n rust "$RS $U/$f.html -o /dev/null"
done

echo "== peak RSS (MB)"
for f in small-hn medium-essay large-mdn xlarge-wiki; do
  echo "$f node=$(python3 peak-rss.py node $ROOT/dist/index.mjs $U/$f.html --no-cache -o /dev/null)" \
    "bun=$(python3 peak-rss.py bun run $ROOT/src/index.ts $U/$f.html --no-cache -o /dev/null)" \
    "rust=$(python3 peak-rss.py $RS $U/$f.html -o /dev/null)"
done | tee results/peak-rss.txt
