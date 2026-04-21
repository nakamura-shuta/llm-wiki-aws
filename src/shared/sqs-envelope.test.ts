import { test, expect } from "bun:test";
import { classify } from "./sqs-envelope.ts";

test("S3 PutObject event → kind: s3", () => {
  const raw = JSON.stringify({
    Records: [
      {
        eventSource: "aws:s3",
        eventName: "ObjectCreated:Put",
        s3: { bucket: { name: "raw" }, object: { key: "foo.md" } },
      },
    ],
  });
  const j = classify(raw);
  expect(j.kind).toBe("s3");
  if (j.kind === "s3") expect(j.records[0].s3.object.key).toBe("foo.md");
});

test("custom ingest → kind: custom", () => {
  const j = classify(JSON.stringify({ type: "ingest", source_key: "raw/foo.md" }));
  expect(j.kind).toBe("custom");
  if (j.kind === "custom") expect(j.type).toBe("ingest");
});

test("custom repair → type: repair", () => {
  const j = classify(JSON.stringify({ type: "repair", page_id: "knn" }));
  expect(j.kind).toBe("custom");
  if (j.kind === "custom") expect(j.type).toBe("repair");
});

test("custom batch → type: batch", () => {
  const j = classify(JSON.stringify({ type: "batch", prefix: "raw/" }));
  expect(j.kind).toBe("custom");
  if (j.kind === "custom") expect(j.type).toBe("batch");
});

test("custom filing → type: filing", () => {
  const j = classify(JSON.stringify({ type: "filing", question: "q", answer: "a", hash: "h", slug: "s" }));
  expect(j.kind).toBe("custom");
  if (j.kind === "custom") expect(j.type).toBe("filing");
});

test("custom lint → type: lint", () => {
  const j = classify(JSON.stringify({ type: "lint" }));
  expect(j.kind).toBe("custom");
  if (j.kind === "custom") expect(j.type).toBe("lint");
});

test("unknown type → throws", () => {
  expect(() => classify(JSON.stringify({ type: "evil" }))).toThrow(/unclassifiable/);
});

test("Records without aws:s3 → throws", () => {
  expect(() => classify(JSON.stringify({ Records: [{ eventSource: "aws:sns" }] }))).toThrow(/unclassifiable/);
});

test("empty object → throws", () => {
  expect(() => classify("{}")).toThrow(/unclassifiable/);
});

test("collision: Records + type → s3 wins", () => {
  const raw = JSON.stringify({
    Records: [{ eventSource: "aws:s3", s3: { bucket: { name: "b" }, object: { key: "k" } } }],
    type: "repair",
  });
  expect(classify(raw).kind).toBe("s3");
});

test("empty Records → throws", () => {
  expect(() => classify(JSON.stringify({ Records: [] }))).toThrow(/unclassifiable/);
});

test("malformed JSON → throws", () => {
  expect(() => classify("not json")).toThrow();
});
