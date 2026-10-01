#!/usr/bin/env bash
# Downloads benchmark fixtures. Pages are third-party content and are not committed.
set -euo pipefail
cd "$(dirname "$0")/fixtures"
fetch() { curl -sSL -A "Mozilla/5.0 into-md-bench" -o "$1.html" "$2"; echo "$1 $(wc -c <"$1.html") bytes"; }
fetch small-hn       "https://news.ycombinator.com/"
fetch medium-essay   "https://www.paulgraham.com/greatwork.html"
fetch medium-blog    "https://blog.rust-lang.org/"
fetch large-pydocs   "https://docs.python.org/3/library/asyncio-task.html"
fetch large-mdn      "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array"
fetch xlarge-wiki    "https://en.wikipedia.org/wiki/Rust_(programming_language)"
