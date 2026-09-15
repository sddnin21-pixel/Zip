import {
  checkFileSize,
  isPathTraversalSafe,
  checkZipSafety,
  isExecutableFile,
  MAX_UPLOAD_SIZE_BYTES,
} from "../../../src/security/file-security";

describe("checkFileSize", () => {
  it("accepts files under the limit", () => {
    expect(checkFileSize(1024).safe).toBe(true);
  });

  it("rejects files over the limit with a clear reason", () => {
    const result = checkFileSize(MAX_UPLOAD_SIZE_BYTES + 1);
    expect(result.safe).toBe(false);
    expect(result.reason).toMatch(/exceeds/);
  });
});

describe("isPathTraversalSafe", () => {
  it("allows normal relative paths", () => {
    expect(isPathTraversalSafe("docs/report.pdf")).toBe(true);
    expect(isPathTraversalSafe("report.pdf")).toBe(true);
  });

  it("rejects absolute paths", () => {
    expect(isPathTraversalSafe("/etc/passwd")).toBe(false);
  });

  it("rejects paths that escape the root via ..", () => {
    expect(isPathTraversalSafe("../../etc/passwd")).toBe(false);
    expect(isPathTraversalSafe("a/../../b")).toBe(false);
  });

  it("allows .. that stays within bounds (descend then ascend)", () => {
    expect(isPathTraversalSafe("a/b/../c")).toBe(true);
  });
});

describe("checkZipSafety", () => {
  it("passes a normal small archive", () => {
    const result = checkZipSafety([
      { path: "readme.txt", compressedSize: 100, uncompressedSize: 200 },
      { path: "data.csv", compressedSize: 5000, uncompressedSize: 20000 },
    ]);
    expect(result.safe).toBe(true);
  });

  it("flags a decompression-bomb-style compression ratio on a single entry", () => {
    const result = checkZipSafety([{ path: "bomb.bin", compressedSize: 100, uncompressedSize: 200_000 }]);
    expect(result.safe).toBe(false);
    expect(result.reason).toMatch(/compression ratio/);
  });

  it("flags an archive whose total uncompressed size exceeds the ceiling", () => {
    const result = checkZipSafety([
      { path: "huge.bin", compressedSize: 400_000_000, uncompressedSize: 600_000_000 },
    ]);
    expect(result.safe).toBe(false);
    expect(result.reason).toMatch(/decompress/);
  });

  it("flags a path-traversal entry inside the archive", () => {
    const result = checkZipSafety([{ path: "../../evil.sh", compressedSize: 10, uncompressedSize: 10 }]);
    expect(result.safe).toBe(false);
    expect(result.reason).toMatch(/escape/);
  });

  it("flags an archive with too many entries", () => {
    const entries = Array.from({ length: 2001 }, (_, i) => ({
      path: `file${i}.txt`,
      compressedSize: 10,
      uncompressedSize: 10,
    }));
    const result = checkZipSafety(entries);
    expect(result.safe).toBe(false);
    expect(result.reason).toMatch(/entries/);
  });
});

describe("isExecutableFile", () => {
  it("flags common executable extensions", () => {
    expect(isExecutableFile("installer.exe")).toBe(true);
    expect(isExecutableFile("script.sh")).toBe(true);
    expect(isExecutableFile("app.apk")).toBe(true);
  });

  it("does not flag ordinary document/data extensions", () => {
    expect(isExecutableFile("report.pdf")).toBe(false);
    expect(isExecutableFile("data.csv")).toBe(false);
    expect(isExecutableFile("notes.md")).toBe(false);
  });
});
