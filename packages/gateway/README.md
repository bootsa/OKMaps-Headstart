# @okmaps/gateway

The small server the browser version of OKMaps needs. It holds no data and
keeps no state beyond a cache: it only forwards requests the browser can't
make itself.

| Route | Forwards to | Why the browser can't call it directly |
|---|---|---|
| `GET /base/search?...` | BASE `PerformSearch` | BASE answers only registered IP addresses and needs the API key |
| `GET /base/repositories` | BASE `ListRepositories` | same; cached for a day (the content provider names used to parse journal fields) |
| `GET /openaire/search/{projects,publications,datasets}?...` | OpenAIRE search API | only needed if OpenAIRE refuses browser requests; `OPENAIRE=off` turns it off |
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
install or build. `docker build -t okmaps-gateway .` makes a container. Set
`TRUST_PROXY=1` behind a reverse proxy so clients are told apart by
`X-Forwarded-For`.

The handler (`createGateway`) takes a Fetch API `Request` and returns a
`Response`, so it also runs on Deno, Bun or Cloudflare Workers with a
three-line entry file. The machine it runs on needs an IP address BASE has
registered.

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
npm ci && npm run typecheck && npm test
```

`test/node.test.ts` runs the gateway on a real Node server and runs the BASE
adaptor of `@okmaps/sources` through it against a recorded BASE answer.
