#!/bin/bash
set -e
cd "$(dirname "$0")/.." || exit 1
BASE="https://raw.githubusercontent.com/Simple-ProgrammerXs/rbx-enforcement-ban-tool/main/patches"
curl -fsSL "$BASE/apply_chunk1.txt" -o /tmp/ac1.txt
curl -fsSL "$BASE/apply_chunk2.txt" -o /tmp/ac2.txt
curl -fsSL "$BASE/apply_chunk3.txt" -o /tmp/ac3.txt
curl -fsSL "$BASE/apply_chunk4.txt" -o /tmp/ac4.txt
cat /tmp/ac1.txt /tmp/ac2.txt /tmp/ac3.txt /tmp/ac4.txt > apply_otp_submitter.py
python3 apply_otp_submitter.py
echo "Done. Now: bun run build && DASHBOARD_HOST=0.0.0.0 bun run start"
