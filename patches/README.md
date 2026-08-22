# OTP Service Patch

Applies the modern Roblox Support Form OTP flow from live HAR capture:

1. `otp-service/v1/sendCode` (+ captcha if needed)
2. IMAP fetch 6-digit code from accounts@roblox.com
3. `otp-service/v1/validateCode`
4. Support POST with `otpSessionToken` (+ captcha if needed)

Also includes recovery probe when support returns soft "OTP verification required".

## On the VM (recommended)

The self-contained apply script (with full embedded submitter) is provided in the Grok conversation. Copy it to the VM and run:

```bash
cd ~/rbx-enforcement-ban-tool
python3 apply_otp_submitter.py
bun run build
DASHBOARD_HOST=0.0.0.0 bun run start
```

It backs up the old file to `submitter.ts.bak-otp`.
