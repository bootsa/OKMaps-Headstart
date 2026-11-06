# @okmaps/storage

Where OKMaps keeps maps. One small interface, `MapStorage`, with an adaptor
per kind of storage. The same adaptors serve the browser app (where a person
keeps their own maps) and the gateway (where published maps for share links
are kept). Plain TypeScript with no runtime dependencies; runs in browsers and
on Node 22.18+.

```ts
interface MapStorage {
  readonly label: string;
  get(key: string): Promise<string | null>;
  put(key: string, body: string, contentType?: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>; // documents directly in a folder
}
```

Keys are relative paths such as `maps/1f3a….json`; keys that would leave the
storage's folder (`..`, leading `/`) are refused.

| Adaptor | Where | Runs in | Notes |
|---|---|---|---|
| `indexedDbStorage()` | this browser | browser | the app's default; works offline |
| `webdavStorage({ url, username, password })` | a WebDAV folder (Nextcloud, ownCloud, Apache, nginx, rclone, …) | both | from a browser the server must allow the site (CORS) for `GET PUT DELETE MKCOL PROPFIND` and the `Authorization`, `Depth` and `Content-Type` headers; missing folders are created |
| `solidStorage({ container, fetch })` | a Solid Pod container | both | pass the authenticated `fetch` of a Solid-OIDC client; `findPod(webId)` finds the Pod a WebID names |
| `bucketStorage(bucket, root)` | an R2 bucket binding, or anything with the same `get/put/delete/list` | Workers, Node | |
| `fileStorage(dir)` (from `@okmaps/storage/node`) | files in a folder | Node | atomic writes |
| `memoryStorage()` | memory | both | tests |

`MapLibrary` keeps a person's maps on any of them: each map is
`maps/<id>.json`, and `index.json` holds what the list of maps shows (title,
date, service, number of documents), so listing doesn't load every map. When
the index is missing or out of step, for example after another device wrote
to the same folder, it is rebuilt from the maps.

Adding a storage means writing those four methods. Planned or possible:
Atomic Data servers, S3 (signed requests), Google Drive / Dropbox (OAuth),
remoteStorage.

## Tests

```
npm ci && npm run typecheck && npm test
```

Every adaptor runs the same tests (store, list, replace, delete, refuse bad
keys, hold a `MapLibrary`). WebDAV and Solid run against in-memory stand-ins
for the servers (`test/fakes.ts`) that answer as real servers do where the
adaptors depend on it (409 for a missing folder, containers created on PUT,
Turtle listings, multistatus answers in the styles of Nextcloud and Apache).
They have not yet been run against real servers.
