import {
  isSafeExternalUrl,
  sanitizeFileName,
  validateToolArguments,
  validateUserMessageText,
} from "../../../src/security/input-validation";

describe("isSafeExternalUrl", () => {
  it("allows ordinary https URLs", () => {
    expect(isSafeExternalUrl("https://example.com/page").safe).toBe(true);
  });

  it("rejects loopback addresses", () => {
    expect(isSafeExternalUrl("http://127.0.0.1:8080/admin").safe).toBe(false);
    expect(isSafeExternalUrl("http://localhost/secret").safe).toBe(false);
  });

  it("rejects private network ranges", () => {
    expect(isSafeExternalUrl("http://10.0.0.5/").safe).toBe(false);
    expect(isSafeExternalUrl("http://192.168.1.1/").safe).toBe(false);
    expect(isSafeExternalUrl("http://172.16.0.1/").safe).toBe(false);
    expect(isSafeExternalUrl("http://169.254.169.254/latest/meta-data").safe).toBe(false); // cloud metadata endpoint
  });

  it("rejects non-http(s) protocols", () => {
    expect(isSafeExternalUrl("file:///etc/passwd").safe).toBe(false);
    expect(isSafeExternalUrl("ftp://example.com/file").safe).toBe(false);
  });

  it("rejects malformed URLs", () => {
    expect(isSafeExternalUrl("not a url").safe).toBe(false);
  });

  it("allows a public IP that merely starts with similar digits to a private range", () => {
    expect(isSafeExternalUrl("http://11.0.0.5/").safe).toBe(true); // not in 10.x
    expect(isSafeExternalUrl("http://172.32.0.1/").safe).toBe(true); // outside 172.16-31.x
  });
});

describe("sanitizeFileName", () => {
  it("strips path separators", () => {
    expect(sanitizeFileName("../../etc/passwd")).not.toContain("/");
    expect(sanitizeFileName("a\\b\\c.txt")).not.toContain("\\");
  });

  it("leaves a normal filename unchanged", () => {
    expect(sanitizeFileName("report-2026.pdf")).toBe("report-2026.pdf");
  });

  it("strips control characters", () => {
    expect(sanitizeFileName("file\u0000name.txt")).toBe("filename.txt");
  });

  it("falls back to a default name when the result would be empty", () => {
    expect(sanitizeFileName("///")).toBe("unnamed");
  });
});

describe("validateToolArguments", () => {
  it("accepts a plain object", () => {
    expect(validateToolArguments({ query: "test" }).valid).toBe(true);
  });

  it("rejects null, arrays, and primitives", () => {
    expect(validateToolArguments(null).valid).toBe(false);
    expect(validateToolArguments([1, 2, 3]).valid).toBe(false);
    expect(validateToolArguments("a string").valid).toBe(false);
    expect(validateToolArguments(42).valid).toBe(false);
  });
});

describe("validateUserMessageText", () => {
  it("rejects empty messages", () => {
    expect(validateUserMessageText("").valid).toBe(false);
  });

  it("accepts ordinary messages", () => {
    expect(validateUserMessageText("Hello there").valid).toBe(true);
  });

  it("rejects messages over the length ceiling", () => {
    const huge = "a".repeat(100_001);
    expect(validateUserMessageText(huge).valid).toBe(false);
  });
});
