"""Word-level similarity between TS and Rust markdown outputs."""
import difflib, pathlib, re, sys
raw = pathlib.Path(__file__).parent / "results" / "raw"
for ts in sorted(raw.glob("*.ts.md")):
    rs = raw / ts.name.replace(".ts.md", ".rs.md")
    a = re.findall(r"\w+", ts.read_text()); b = re.findall(r"\w+", rs.read_text())
    r = difflib.SequenceMatcher(None, a, b, autojunk=False).ratio()
    print(f"{ts.name.replace('.ts.md',''):14} ts_words={len(a):6} rs_words={len(b):6} similarity={r:.3f}")
