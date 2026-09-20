import { describe, expect, it } from "vitest";
import { parseLogLines, TS_RE } from "./pm2.js";

const MTIME = Date.parse("2026-09-20T03:04:05.000Z");
const MTIME_ISO = "2026-09-20T03:04:05";

function one(line: string) {
  return parseLogLines(line, "out", MTIME)[0]!;
}

describe("TS_RE (prefix timestamp)", () => {
  const shouldMatch: Array<[string, string]> = [
    ["2026-09-20T10:11:12: pesan", "2026-09-20T10:11:12"],
    ["2026-09-20T10:11:12.345: pesan", "2026-09-20T10:11:12.345"],
    ["2026-09-20T10:11:12.345Z: pesan", "2026-09-20T10:11:12.345Z"],
    ["2026-09-20T10:11:12+07:00: pesan", "2026-09-20T10:11:12+07:00"],
    ["2026-09-20T10:11:12.345+07:00: pesan", "2026-09-20T10:11:12.345+07:00"],
  ];
  for (const [input, ts] of shouldMatch) {
    it(`match: ${input}`, () => {
      expect(TS_RE.exec(input)?.[1]).toBe(ts);
    });
  }

  const shouldNotMatch = [
    "2026-09-20 isi biasa",
    "[dashboard] x",
    '{"level":30}',
    "2026-09-20T10:11:12:pesan", // tanpa spasi setelah ':'
  ];
  for (const input of shouldNotMatch) {
    it(`tidak match: ${input}`, () => {
      expect(TS_RE.exec(input)).toBeNull();
    });
  }
});

describe("parseLogLines", () => {
  it("memisahkan prefix timestamp secara dinamis (termasuk zona)", () => {
    const line = one("2026-09-20T10:11:12.345+07:00: pesan");
    expect(line.timestamp).toBe("2026-09-20T10:11:12.345+07:00");
    expect(line.line).toBe("pesan");
    expect(line.estimated).toBe(false);
  });

  it("baris tanpa prefix → timestamp dari mtime + estimated:true", () => {
    const line = one('{"level":30,"msg":"halo"}');
    expect(line.timestamp).toBe(MTIME_ISO);
    expect(line.estimated).toBe(true);
    expect(line.line).toBe('{"level":30,"msg":"halo"}');
  });

  it("continuation mewarisi timestamp asli & estimated induk", () => {
    const lines = parseLogLines("2026-09-20T10:11:12: baris1\nlanjutan", "out", MTIME);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.line).toBe("baris1\nlanjutan");
    expect(lines[0]!.timestamp).toBe("2026-09-20T10:11:12");
    expect(lines[0]!.estimated).toBe(false);
  });

  it("continuation mewarisi estimated:true saat induk tanpa prefix", () => {
    const lines = parseLogLines("baris pertama\nlanjutan", "err", MTIME);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.estimated).toBe(true);
    expect(lines[0]!.timestamp).toBe(MTIME_ISO);
  });

  it("tidak pernah menghasilkan timestamp kosong", () => {
    const lines = parseLogLines(
      '[dashboard] x\n{"level":30}\n2026-09-20T10:11:12: asli',
      "out",
      MTIME,
    );
    expect(lines.every((l) => l.timestamp !== "")).toBe(true);
  });
});
