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
| `atomicStorage({ parent, agent })` | an Atomic Data server (atomic-server 0.40/0.41) | both | each document is a File under `parent` (a Drive or Folder), uploaded through `/upload` and read from its download URL; replacing uploads the new file and destroys the old one with a signed Commit. `agentFromSecret(secret)` reads the secret the data browser shows. Requests are signed with Ed25519 through WebCrypto, as `@tomic/lib` signs them; from a browser the server must allow the site (CORS) |
| `bucketStorage(bucket, root)` | an R2 bucket binding, or anything with the same `get/put/delete/list` | Workers, Node | |
| `fileStorage(dir)` (from `@okmaps/storage/node`) | files in a folder | Node | atomic writes |
| `memoryStorage()` | memory | both | tests |

`MapLibrary` keeps a person's maps on any of them: each map is
`maps/<id>.json`, and `index.json` holds what the list of maps shows (title,
date, service, number of documents), so listing doesn't load every map. When
the index is missing or out of step, for example after another device wrote
to the same folder, it is rebuilt from the maps.

`MapTree` adds folders on any storage: a folder is a `MapLibrary` under a key
prefix, `folders.json` names its subfolders (which live under
`folders/<name>/`), and the top folder is the storage's root, so maps saved
before folders existed stay where they are. Renaming copies a folder's
documents, since storages have no rename.

`MapStore` is one place a person keeps maps, as the app's settings list it:
a named instance of a store type, with `list/get/save/delete` by folder path
and, where the type allows folders, `createFolder/renameFolder/deleteFolder`.
`treeStore(info, storage, { folders })` makes one on any storage, and
`moveMap(from, to, id)` moves a map between folders or stores (saved there
first, then removed here).

`exportMaps(store, path)` writes the maps of a folder and its subfolders to
one JSON document (`{ format: "okmaps-maps", version: 1, exported, maps:
[{ path, map }] }`), and `importMaps(store, path, parseMapsFile(text))`
saves such a file, or a single map's JSON, into any store: with its
subfolders where the store has folders, otherwise all at the top. A map
whose id is already there is replaced (it is the same map).
`parseMapsFile` refuses anything that is not a map, an id that is not a
safe key, and folder names that would leave the folder.

Adding a storage means writing those four methods. Planned or possible: S3 (signed requests), Google Drive / Dropbox (OAuth),
remoteStorage.

## Tests

```
pnpm install && pnpm typecheck && pnpm test
```

Every adaptor runs the same tests (store, list, replace, delete, refuse bad
keys, hold a `MapLibrary`). WebDAV and Solid run against in-memory stand-ins
for the servers (`test/fakes.ts`) that answer as real servers do where the
adaptors depend on it (409 for a missing folder, containers created on PUT,
Turtle listings, multistatus answers in the styles of Nextcloud and Apache).
The Atomic Data stand-in checks every request signature and Commit signature
with Node's own Ed25519, and the signer is checked against RFC 8032's test
vector. None of them has yet been run against a real server.

To check the Atomic Data adaptor against a real server (it writes and then
removes a few small test documents under the folder you give):

```
ATOMIC_PARENT=https://atomic.example.org/drive/okmaps-test \
ATOMIC_SECRET=<agent secret from the data browser's User settings> \
node --experimental-strip-types packages/storage/scripts/check-atomic.ts
```
