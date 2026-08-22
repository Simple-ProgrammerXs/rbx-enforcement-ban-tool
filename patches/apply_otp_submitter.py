#!/usr/bin/env python3
"""Apply modern otp-service submitter.ts patch (from HAR-verified flow).

If the b64 parts are broken, the full self-contained version is provided in the chat.
"""
import base64, gzip, pathlib, sys, urllib.request

def main():
    target = pathlib.Path("src/modules/submitter.ts")
    if not target.parent.is_dir():
        print("Run from repo root (rbx-enforcement-ban-tool)", file=sys.stderr)
        sys.exit(1)
    base = "https://raw.githubusercontent.com/Simple-ProgrammerXs/rbx-enforcement-ban-tool/main/patches/"
    try:
        p1 = urllib.request.urlopen(base + "submitter.b64.part1").read().decode().strip()
        p2 = urllib.request.urlopen(base + "submitter.b64.part2").read().decode().strip()
        b64 = (p1 + p2).strip()
        raw = gzip.decompress(base64.b64decode(b64))
    except Exception as e:
        print("Download/decode failed:", e)
        print("Use the self-contained apply script from the Grok conversation instead.")
        sys.exit(1)
    if target.exists():
        target.with_suffix(".ts.bak-otp").write_bytes(target.read_bytes())
    target.write_bytes(raw)
    print(f"OK wrote {target} ({len(raw)} bytes)")
    print("Next: bun run build && DASHBOARD_HOST=0.0.0.0 bun run start")

if __name__ == "__main__":
    main()
