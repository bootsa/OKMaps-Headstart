/** Object stores through a binding such as a Cloudflare Workers R2 bucket. */
import { checkKey, checkPrefix, type MapStorage } from "./types.ts";

/** The part of an R2 bucket binding (or similar) used here. */
export interface ObjectBucket {
  get(key: string): Promise<{ text(): Promise<string> } | null>;
  put(key: string, value: string, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  delete(key: string): Promise<unknown>;
  list(options?: { prefix?: string; delimiter?: string; cursor?: string }): Promise<{
    objects: Array<{ key: string }>;
    truncated?: boolean;
    cursor?: string;
  }>;
}

/** Keeps documents in the bucket under `root` (default "", e.g. "okmaps/"). */
export function bucketStorage(bucket: ObjectBucket, root = ""): MapStorage {
  if (root) checkPrefix(root);
  return {
    label: `bucket${root ? ` (${root})` : ""}`,
    get: async (key) => {
      const obj = await bucket.get(root + checkKey(key));
      return obj ? obj.text() : null;
    },
    put: async (key, body, contentType = "application/json") => {
      await bucket.put(root + checkKey(key), body, { httpMetadata: { contentType } });
    },
    delete: async (key) => void (await bucket.delete(root + checkKey(key))),
    list: async (prefix = "") => {
      const keys: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await bucket.list({ prefix: root + checkPrefix(prefix), delimiter: "/", cursor });
        keys.push(...page.objects.map((o) => o.key.slice(root.length)));
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
      return keys.filter((k) => !k.slice(prefix.length).includes("/")).sort();
    },
  };
}
