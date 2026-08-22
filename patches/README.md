# OTP Service Patch

Applies the modern Roblox Support Form OTP flow from live HAR capture:

1. `otp-service/v1/sendCode` (+ captcha if needed)
2. IMAP fetch 6-digit code
3. `otp-service/v1/validateCode`
4. Support POST with `otpSessionToken` (+ captcha if needed)

## On the VM

```bash
cd ~/rbx-enforcement-ban-tool
curl -fsSL https://raw.githubusercontent.com/Simple-ProgrammerXs/rbx-enforcement-ban-tool/main/patches/apply_otp_submitter.py -o apply_otp_submitter.py
python3 apply_otp_submitter.py
bun run build
DASHBOARD_HOST=0.0.0.0 bun run start
```
