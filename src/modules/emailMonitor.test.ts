import { describe, expect, test } from "bun:test";
import { parseRobloxResponse } from "./emailMonitor";

describe("parseRobloxResponse", () => {
  test("detects approved responses in English", () => {
    expect(parseRobloxResponse("Appeal approved", "Your account has been restored.")).toBe(
      "approved",
    );
  });

  test("detects rejected responses in English", () => {
    expect(parseRobloxResponse("Appeal denied", "This action still violates Roblox rules.")).toBe(
      "rejected",
    );
  });

  test("detects submitted responses in English", () => {
    expect(parseRobloxResponse("Appeal request for account", "We have received your appeal.")).toBe(
      "submitted",
    );
  });

  test("detects Roblox submitted confirmation wording", () => {
    expect(
      parseRobloxResponse(
        "Your appeal is submitted",
        "This message confirms your appeal request for: creating or using an account to avoid an enforcement action taken against another account.",
        "no-reply@roblox.com",
      ),
    ).toBe("submitted");
  });

  test("detects escalated support tickets", () => {
    expect(parseRobloxResponse("Roblox support ticket", "", "support-en@roblox.com")).toBe(
      "escalated",
    );
  });

  test("detects numbered Roblox support ticket subjects as escalated", () => {
    expect(
      parseRobloxResponse("Roblox Support Ticket 171470673", "", "support-en@roblox.com"),
    ).toBe("escalated");
  });

  test("detects fixed Unicode approval terms", () => {
    expect(parseRobloxResponse("\u627f\u8a8d", "")).toBe("approved");
  });
});
