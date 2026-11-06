/**
 * Where maps are kept. A storage holds text documents under keys such as
 * "maps/1f3a….json". Keys use "/" between parts and are relative to the
 * storage's own root (a folder, a Pod container, a bucket prefix).
 */
export interface MapStorage {
  /** A short name for messages, e.g. "WebDAV (https://dav.example.org/okmaps/)". */
  readonly label: string;
  /** The document, or null if there is none. */
  get(key: string): Promise<string | null>;
  /** Creates or replaces the document (and any folders it needs). */
  put(key: string, body: string, contentType?: string): Promise<void>;
  /** Removes the document; removing one that is not there is not an error. */
  delete(key: string): Promise<void>;
  /** The keys of the documents directly under the folder `prefix` ("" for the root, else ending in "/"). */
  list(prefix?: string): Promise<string[]>;
}

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

/** Thrown when a storage answers with an error. */
export class StorageError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "StorageError";
    this.status = status;
  }
}

/** Keys are plain relative paths: no "..", no leading "/", no empty parts. */
export function checkKey(key: string): string {
  if (!key || key.startsWith("/") || key.split("/").some((p) => p === "" || p === "." || p === "..") || /[\\\u0000-\u001f]/.test(key)) {
    throw new StorageError(`invalid key: ${JSON.stringify(key)}`);
  }
  return key;
}

export function checkPrefix(prefix: string): string {
  if (prefix === "") return prefix;
  if (!prefix.endsWith("/")) throw new StorageError(`a folder prefix ends with "/": ${JSON.stringify(prefix)}`);
  checkKey(prefix.slice(0, -1));
  return prefix;
}

/** The URL of a key under a base URL ending in "/", each part percent-encoded. */
export function keyUrl(base: string, key: string): string {
  return base + key.split("/").map(encodeURIComponent).join("/");
}
