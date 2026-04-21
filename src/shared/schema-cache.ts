/**
 * Schema S3 fetch の task-lifetime cache。
 *
 * - 初回呼び出し時に SCHEMA_FILES 全部を並列 fetch
 * - 部分成功 (>=1 file 読めた) は cache
 * - SCHEMA_BUCKET 未設定時は空文字を cache (意図的無効化)
 * - **全 file 失敗時は cache せず**、次回呼び出しで retry される
 *
 * schema 差し替え時は task 再起動 (`aws ecs update-service --force-new-deployment`) で反映。
 *
 * **注意（singleton cache）**: cache は bucket / loader で key 分けしていない。
 * 最初に成功した読み出し結果が process 全体で固定される。v2 PoC では SCHEMA_BUCKET
 * は task 起動時に 1 つ + 1 loader で動作するため問題にならないが、将来:
 *  - 複数 bucket / provider を同 process 内で切り替えたい
 *  - ingest/lint/repair で別々の schema を持ちたい
 * といった要件が出てきたら `Map<string, Promise<string>>` 化が必要。
 */

const SCHEMA_FILES = [
  "schema/page-taxonomy.md",
  "schema/naming-conventions.md",
  "schema/wiki-structure.md",
] as const;

export interface SchemaLoader {
  /** 単一ファイルを fetch。失敗時は throw。 */
  fetchFile(key: string): Promise<string>;
}

let schemaPromise: Promise<string> | null = null;

/** テスト用: 起動時の状態に戻す */
export function resetSchemaCache(): void {
  schemaPromise = null;
}

export async function loadSchema(loader: SchemaLoader, bucket: string | undefined): Promise<string> {
  if (schemaPromise) return schemaPromise;

  if (!bucket) {
    console.log(`[schema-cache] SCHEMA_BUCKET not set; caching empty schema`);
    schemaPromise = Promise.resolve("");
    return "";
  }

  // 同時 await するため、Promise を即座に schemaPromise にセットして race-free に。
  // 全 file 失敗時は後段で schemaPromise を null に戻し、次回の呼び出しで retry させる。
  // fetch は {ok, text} に正規化し、fetch 成功数 (loadedCount) と
  // 中身の bytes (merged) を区別できるようにする。file が存在するが空文字というレアケースでも
  // 「fetch は成功した」とみなし cache する (毎回 retry を避けるため)。
  const attempt = (async (): Promise<{ merged: string; loadedCount: number }> => {
    const results = await Promise.all(
      SCHEMA_FILES.map(async (f) => {
        try {
          return { ok: true, text: await loader.fetchFile(f) };
        } catch (e) {
          console.warn(`[schema-cache] fetch failed: ${f}:`, (e as Error).message);
          return { ok: false, text: "" };
        }
      }),
    );
    const loadedCount = results.filter((r) => r.ok).length;
    // merged は中身のあるファイルだけを join。空文字 fetch 成功は
    // loadedCount にのみカウントして retry を抑止し、出力からは除外する。
    const merged = results
      .filter((r) => r.ok && r.text.length > 0)
      .map((r) => r.text)
      .join("\n\n---\n\n");
    console.log(
      `[schema-cache] cached: ${merged.length} chars, loaded=${loadedCount}/${SCHEMA_FILES.length}`,
    );
    return { merged, loadedCount };
  })();

  schemaPromise = attempt.then(({ merged }) => merged);

  const { merged, loadedCount } = await attempt;
  if (loadedCount === 0) {
    // 全 fetch 失敗 → cache をクリアして次回 retry。
    // この時点で同時 await していた他の caller は同じ空文字を受け取る（同じ試行の結果なので整合）。
    console.warn(`[schema-cache] all schema files failed; clearing cache for retry on next call`);
    schemaPromise = null;
  }
  return merged;
}
