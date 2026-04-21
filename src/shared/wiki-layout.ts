import { readdir, mkdir } from "node:fs/promises";
import path from "node:path";

const WIKI = process.env.WIKI_MOUNT ?? "/mnt/wiki";

export interface EntityEntry {
  id: string;
  canonical: string;
  aliases: string[];
  type: string;
  page: string;
}

export interface EntityRegistry {
  version: string;
  entities: EntityEntry[];
}

export interface SourceMapEntry {
  key: string;
  hash: string;
  affected_pages: string[];
  ingested_at: string;
}

export function wikiPath(...segments: string[]): string {
  return path.join(WIKI, ...segments);
}

export async function readWikiFile(relativePath: string): Promise<string | null> {
  const f = Bun.file(wikiPath(relativePath));
  if (!(await f.exists())) return null;
  return f.text();
}

export async function writeWikiFile(relativePath: string, content: string): Promise<void> {
  const full = wikiPath(relativePath);
  await mkdir(path.dirname(full), { recursive: true });
  await Bun.write(full, content);
}

export async function readEntityRegistry(): Promise<EntityRegistry> {
  const text = await readWikiFile("entity-registry.json");
  if (!text) return { version: "1.0", entities: [] };
  return JSON.parse(text) as EntityRegistry;
}

export async function readSourceMap(): Promise<SourceMapEntry[]> {
  const text = await readWikiFile("source-map.json");
  if (!text) return [];
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed as SourceMapEntry[];
  if (Array.isArray(parsed.sources)) return parsed.sources as SourceMapEntry[];
  return [];
}

export async function listPages(dir: "entities" | "topics" | "queries"): Promise<string[]> {
  const dirPath = wikiPath(dir);
  try {
    const entries = await readdir(dirPath);
    return entries.filter((f) => f.endsWith(".md")).map((f) => `${dir}/${f}`);
  } catch {
    return [];
  }
}

export async function readIndex(): Promise<string | null> {
  return readWikiFile("index.md");
}

export function buildAliasMap(registry: EntityRegistry): Map<string, string> {
  const map = new Map<string, string>();
  for (const e of registry.entities) {
    map.set(e.canonical.toLowerCase(), e.page);
    for (const alias of e.aliases) {
      map.set(alias.toLowerCase(), e.page);
    }
  }
  return map;
}
