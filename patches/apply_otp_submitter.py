#!/usr/bin/env python3
"""Apply modern otp-service submitter.ts patch (from HAR-verified flow)."""
import base64, gzip, pathlib, sys
# Download parts from repo if embedded B64 missing - fallback uses urllib
import urllib.request

def main():
    target = pathlib.Path("src/modules/submitter.ts")
    if not target.parent.is_dir():
        print("Run from repo root (rbx-enforcement-ban-tool)", file=sys.stderr)
        sys.exit(1)
    # Prefer local embedded; else fetch from this repo raw
    base = "https://raw.githubusercontent.com/Simple-ProgrammerXs/rbx-enforcement-ban-tool/main/patches/"
    try:
        p1 = urllib.request.urlopen(base + "submitter.b64.part1").read().decode()
        p2 = urllib.request.urlopen(base + "submitter.b64.part2").read().decode()
        b64 = (p1 + p2).strip()
    except Exception as e:
        print("Failed to download b64 parts:", e, file=sys.stderr)
        sys.exit(1)
    raw = gzip.decompress(base64.b64decode(b64))
    if target.exists():
        target.with_suffix(".ts.bak-otp").write_bytes(target.read_bytes())
    target.write_bytes(raw)
    print(f"OK wrote {target} ({len(raw)} bytes)")
    print("Next: bun run build && DASHBOARD_HOST=0.0.0.0 bun run start")

if __name__ == "__main__":
    main()
