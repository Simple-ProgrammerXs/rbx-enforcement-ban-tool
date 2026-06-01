import { describe, expect, test } from "bun:test";
import { emailDomain, imapHostForEmail } from "./emailProviders";

describe("emailProviders", () => {
  test("extracts the domain", () => {
    expect(emailDomain("User@Gmail.com")).toBe("gmail.com");
    expect(emailDomain("a.b+tag@Outlook.COM")).toBe("outlook.com");
  });

  test("resolves Gmail hosts", () => {
    expect(imapHostForEmail("user@gmail.com")).toBe("imap.gmail.com");
    expect(imapHostForEmail("user@googlemail.com")).toBe("imap.gmail.com");
  });

  test("resolves Outlook/Microsoft hosts", () => {
    expect(imapHostForEmail("user@outlook.com")).toBe("outlook.office365.com");
    expect(imapHostForEmail("user@hotmail.com")).toBe("outlook.office365.com");
    expect(imapHostForEmail("user@live.com")).toBe("outlook.office365.com");
  });

  test("returns undefined for unknown providers", () => {
    expect(imapHostForEmail("user@self-hosted.example")).toBeUndefined();
  });
});
