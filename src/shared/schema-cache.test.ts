import { describe, test, expect, beforeEach } from "bun:test";
import { loadSchema, resetSchemaCache, type SchemaLoader } from "./schema-cache.ts";

function makeLoader(
  behavior: Record<string, "ok" | "fail" | string>,
): { loader: SchemaLoader; calls: string[] } {
  const calls: string[] = [];
  const loader: SchemaLoader = {
    fetchFile: async (key: string) => {
      calls.push(key);
      const v = behavior[key] ?? "ok";
      if (v === "fail") throw new Error(`mock fail: ${key}`);
      if (v === "ok") return `content-of-${key}`;
      return v;
    },
  };
  return { loader, calls };
}

beforeEach(() => {
  resetSchemaCache();
});

describe("loadSchema cache", () => {
  test("初回: 3 file 全成功 → cache される", async () => {
    const { loader, calls } = makeLoader({});
    const r1 = await loadSchema(loader, "bucket");
    expect(r1).toContain("content-of-schema/page-taxonomy.md");
    expect(r1).toContain("content-of-schema/naming-conventions.md");
    expect(r1).toContain("content-of-schema/wiki-structure.md");
    expect(calls.length).toBe(3);

    const r2 = await loadSchema(loader, "bucket");
    expect(r2).toBe(r1);
    expect(calls.length).toBe(3); // 追加 fetch なし
  });

  test("並行呼び出し: 複数 loadSchema が同時 → S3 fetch は 3 回だけ (race-free)", async () => {
    const { loader, calls } = makeLoader({});
    const [a, b, c] = await Promise.all([
      loadSchema(loader, "bucket"),
      loadSchema(loader, "bucket"),
      loadSchema(loader, "bucket"),
    ]);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(calls.length).toBe(3);
  });

  test("部分成功 (2/3 file 成功) → 成功分だけ cache", async () => {
    const { loader, calls } = makeLoader({
      "schema/naming-conventions.md": "fail",
    });
    const r = await loadSchema(loader, "bucket");
    expect(r).toContain("content-of-schema/page-taxonomy.md");
    expect(r).not.toContain("naming-conventions");
    expect(r).toContain("content-of-schema/wiki-structure.md");
    expect(calls.length).toBe(3);

    // 2 回目: cache hit
    await loadSchema(loader, "bucket");
    expect(calls.length).toBe(3);
  });

  test("全 file 失敗 → cache せず、次回 retry される", async () => {
    const { loader, calls } = makeLoader({
      "schema/page-taxonomy.md": "fail",
      "schema/naming-conventions.md": "fail",
      "schema/wiki-structure.md": "fail",
    });
    const r1 = await loadSchema(loader, "bucket");
    expect(r1).toBe("");
    expect(calls.length).toBe(3);

    // 2 回目: retry されて再度 3 file fetch
    const r2 = await loadSchema(loader, "bucket");
    expect(r2).toBe("");
    expect(calls.length).toBe(6);
  });

  test("全 file 失敗 → retry 時に成功すれば正常 cache に移行", async () => {
    let shouldFail = true;
    const loader: SchemaLoader = {
      fetchFile: async (key: string) => {
        if (shouldFail) throw new Error("transient");
        return `content-of-${key}`;
      },
    };
    // 1 回目: 失敗
    const r1 = await loadSchema(loader, "bucket");
    expect(r1).toBe("");

    // 2 回目: 回復
    shouldFail = false;
    const r2 = await loadSchema(loader, "bucket");
    expect(r2).toContain("content-of-schema/page-taxonomy.md");

    // 3 回目: cache hit
    let callsAfterThird = 0;
    const loader2: SchemaLoader = {
      fetchFile: async (key: string) => {
        callsAfterThird++;
        return "should-not-be-called";
      },
    };
    const r3 = await loadSchema(loader2, "bucket");
    expect(r3).toBe(r2);
    expect(callsAfterThird).toBe(0);
  });

  test("全 file が空文字で成功 (file は存在するが中身が空) → cache され retry しない", async () => {
    let callCount = 0;
    const loader: SchemaLoader = {
      fetchFile: async () => {
        callCount++;
        return ""; // 存在するが空
      },
    };
    const r1 = await loadSchema(loader, "bucket");
    expect(r1).toBe("");
    expect(callCount).toBe(3);

    // 2 回目: cache hit (空でも成功扱いなので retry しない)
    const r2 = await loadSchema(loader, "bucket");
    expect(r2).toBe("");
    expect(callCount).toBe(3);
  });

  test("SCHEMA_BUCKET 未設定 → 空文字を cache (意図的無効化)", async () => {
    const loader: SchemaLoader = {
      fetchFile: async () => {
        throw new Error("should not be called");
      },
    };
    const r = await loadSchema(loader, undefined);
    expect(r).toBe("");

    const r2 = await loadSchema(loader, undefined);
    expect(r2).toBe("");
  });
});
