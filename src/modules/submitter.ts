import { randomUUID } from "node:crypto";
import * as tls from "node:tls";
import { Agent, ProxyAgent } from "undici";
import { SocksClient } from "socks";
import type { AccountConfig, CaptchaConfig } from "../types";
import { solveCaptcha } from "./captcha";
import { Logger } from "./logger";
import { fetchOtpCode } from "./otpFetcher";

// NOTE: Full file will be uploaded - temporary marker
export {};
