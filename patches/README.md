# OTP Service Patch

Applies the modern Roblox Support Form OTP flow from live HAR capture:

1. `otp-service/v1/sendCode` (+ captcha if needed)
2. IMAP fetch 6-digit code from accounts@roblox.com
3. `otp-service/v1/validateCode`
4. Support POST with `otpSessionToken` (+ captcha if needed)

Also includes recovery probe when support returns soft "OTP verification required".

## On the VM (recommended)

```bash
cd ~/rbx-enforcement-ban-tool   # or wherever the repo is
curl -fsSL https://raw.githubusercontent.com/Simple-ProgrammerXs/rbx-enforcement-ban-tool/main/patches/apply_otp_submitter.py -o apply_otp_submitter.py
python3 apply_otp_submitter.py
bun run build
DASHBOARD_HOST=0.0.0.0 bun run start
```

The apply script embeds the full patched `submitter.ts` (gzip+base64). It backs up the old file to `submitter.ts.bak-otp`.

## Alternative: pull main (after this commit lands)

```bash
cd ~/rbx-enforcement-ban-tool
git pull origin main
bun run build
DASHBOARD_HOST=0.0.0.0 bun run start
```
