import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { getStrategy } = require("../dist/vault/optimizer/strategy-detector.js");
const { calculateSavings } = require("../dist/vault/optimizer/savings.js");
const { ChunkIndexService } = require("../dist/vault/chunks/chunk-index.service.js");

test("JPEG uses lossless JPEG XL strategy and never WebP/AVIF", () => {
  const decision = getStrategy("photo.jpg", "image/jpeg", "lossless-safe");
  assert.equal(decision.strategy, "jpeg-xl-lossless");
  assert.notEqual(decision.strategy, "webp");
  assert.notEqual(decision.strategy, "avif");
});

test("MP4 uses remux strategy without codec reencode", () => {
  const decision = getStrategy("video.mp4", "video/mp4", "lossless-safe");
  assert.equal(decision.strategy, "mp4-remux");
  assert.equal(decision.algorithm, "MP4 Remux");
});

test("text selects zstd in safe mode and xz in archive mode", () => {
  assert.equal(getStrategy("data.json", "application/json", "lossless-safe").strategy, "zstd");
  assert.equal(getStrategy("data.json", "application/json", "lossless-archive").strategy, "xz");
});

test("precompressed archives are skipped", () => {
  const decision = getStrategy("backup.zip", "application/zip", "lossless-safe");
  assert.equal(decision.strategy, "skip");
  assert.equal(decision.shouldAttempt, false);
});

test("low savings are rejected", () => {
  const result = calculateSavings(1000, 990, 2);
  assert.equal(result.accepted, false);
});

test("savings above threshold are accepted", () => {
  const result = calculateSavings(1000, 900, 2);
  assert.equal(result.accepted, true);
});

test("chunk index detects repeated chunks", () => {
  const index = new ChunkIndexService();
  index.upsert({ chunkHash: "abc", encryptedPath: "chunk.enc", sizeBytes: 10 });
  assert.equal(index.find("abc")?.encryptedPath, "chunk.enc");
});
