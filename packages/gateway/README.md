# @okmaps/gateway

The small server the browser version of OKMaps needs. It forwards requests
the browser can't make itself and, if turned on, keeps the maps people
publish as share links. It holds nothing else.

| Route | Forwards to | Why the browser can't call it directly |
|---|---|---|
| `GET /base/search?...` | BASE `PerformSearch` | BASE answers only registered IP addresses and needs the API key |
| `GET /base/repositories` | BASE `ListRepositories` | same; cached for a day (the content provider names used to parse journal fields) |
| `GET /openaire/search/{projects,publications,datasets}?...` | OpenAIRE search API | only needed if OpenAIRE refuses browser requests; `OPENAIRE=off` turns it off |
| `POST /maps` | | publishes a map (share link); answers `201 {"id": ...}` |
| `GET /maps/{id}` | | a published map |
| `GET /health` | | |

Bodies come back unchanged, so `@okmaps/sources` parses them exactly as it
parses the providers' own answers:

```ts
import { fetchBaseContentProviders, searchBase } from "@okmaps/sources";
const contentProviders = await fetchBaseContentProviders("https://gateway.example/base/repositories");
const { papers, content } = await searchBase(params, { endpoint: "https://gateway.example/base/search", contentProviders });
```

## Running it

```
BASE_API_KEY=... ALLOWED_ORIGINS=https://maps.example.org PORT=8787 node src/server.ts
```

Node 22.18 or later runs the TypeScript directly; there is nothing to
install or build. `docker build -f gateway/Dockerfile -t okmaps-gateway packages`
(from the repository root) makes a container; it includes `packages/storage`. Set
`TRUST_PROXY=1` behind a reverse proxy so clients are told apart by
`X-Forwarded-For`.

The handler (`createGateway`) takes a Fetch API `Request` and returns a
`Response`, so it also runs on Deno, Bun or Cloudflare Workers with a
three-line entry file. The machine it runs on needs an IP address BASE has
registered.

## Published maps

A share link is `map.html?shared=<id>`. The browser sends the map
(`{title, context, documents}`, the record the visualisation reads) to
`POST /maps`; the gateway checks its shape, keeps only those three fields
and stores it under an id made from its content (the first 96 bits of its
SHA-256, 24 hex characters). The same map published twice gets the same id.
Published maps never change, so `GET /maps/{id}` is cacheable for a year.
There is no listing and no delete route.

Publishing is off unless a store is given. Maps are kept with the adaptors
of `packages/storage`:

- `MAPS_DIR=/var/lib/okmaps/maps` with `src/server.ts` keeps one JSON file per map.
- `MAPS_WEBDAV_URL=https://dav.example.org/okmaps/` keeps them in a WebDAV
  folder, with `MAPS_WEBDAV_USER` and `MAPS_WEBDAV_PASSWORD` (or
  `MAPS_WEBDAV_TOKEN` for a bearer token).
- `bucketStore(env.MAPS)` keeps them in a Cloudflare R2 bucket, as `maps/<id>.json`.
- `storageMapStore(anyStorage)` takes any other `MapStorage`.
- `memoryStore()` for tests.

Maps are at most 3 MB and 1000 documents, and a client may publish 30 per
hour. The browser app treats a shared map as untrusted: the visualisation
puts area titles into the page as HTML, so the app replaces `<`, `>` and `&`
in every field before drawing it.

## Limits

- **BASE pacing.** BASE asks for at most one request per second. All users
  share the gateway's IP, so the gateway spaces BASE requests one second
  apart in arrival order. A request that would wait more than 30 seconds
  gets `503` with `Retry-After`. A BASE map takes 1 to 10 requests, so one
  gateway serves roughly 6 to 60 new BASE maps a minute.
- **Per client.** 60 requests per 5 minutes per client address (`429` with
  `Retry-After` above that).
- **Origins.** Browsers on other sites are refused (`403`). This does not
  stop scripts, which can send any `Origin`; the per-client limit is what
  protects the BASE key from them.
- Only BASE's search parameters pass (`query`, `coll`, `target`, `boost`,
  `fields`, `hits` up to 125, `offset`, `sortby`, `facets`, `facet_limit`,
  `facet_sort`, `filter`, `triple`). `func` and `apikey` are always set by
  the gateway.

The pacing and limits are kept in memory, so they hold per process. Running
several instances, or on Workers (one instance per location), multiplies
them; a shared store would be needed then.

## Tests

```
pnpm install && pnpm typecheck && pnpm test
```

`test/node.test.ts` runs the gateway on a real Node server and runs the BASE
adaptor of `@okmaps/sources` through it against a recorded BASE answer.
