/**
 * Checks the Atomic Data adaptor against a real server.
 *
 *   ATOMIC_PARENT=https://example.org/drive/okmaps-test \
 *   ATOMIC_SECRET=<agent secret from the data browser's User settings> \
 *   node --experimental-strip-types packages/storage/scripts/check-atomic.ts
 *
 * The parent must exist (make a Folder in the data browser) and the agent
 * must be allowed to write it. The check writes, replaces, lists and deletes
 * a few small test documents there, and cleans up after itself. It also asks
 * the server whether a browser on APP_ORIGIN (default the GitHub Pages site)
 * would be let through (CORS).
 */
import { agentFromSecret, atomicStorage, MapLibrary } from "../src/index.ts";

const parent = process.env.ATOMIC_PARENT;
const secret = process.env.ATOMIC_SECRET;
const appOrigin = process.env.APP_ORIGIN ?? "https://bootsa.github.io";
if (!parent || !secret) {
  console.error("Set ATOMIC_PARENT and ATOMIC_SECRET (see the top of this file).");
  process.exit(2);
}

const storage = atomicStorage({ parent, agent: agentFromSecret(secret) });
let failed = 0;
async function step(name: string, fn: () => Promise<unknown>) {
  try {
    const out = await fn();
    console.log(`ok    ${name}${out === undefined ? "" : `: ${JSON.stringify(out)}`}`);
  } catch (err) {
    failed++;
    console.log(`FAIL  ${name}: ${err instanceof Error ? err.message : err}`);
  }
}
const expectEq = (got: unknown, want: unknown) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
  return got;
};

const key = `okmaps-check/${Date.now()}.json`;
await step("list", () => storage.list());
await step("write a document", () => storage.put(key, '{"n":1}'));
await step("read it back", async () => expectEq(await storage.get(key), '{"n":1}'));
await step("replace it", async () => {
  await storage.put(key, '{"n":2,"text":"ü ✓"}');
  return expectEq(await storage.get(key), '{"n":2,"text":"ü ✓"}');
});
await step("list it once", async () => expectEq((await storage.list("okmaps-check/")).filter((k) => k === key), [key]));
await step("a 300 KB document (map size)", async () => {
  const big = JSON.stringify({ text: "x".repeat(300_000) });
  await storage.put(`${key}.big`, big);
  expectEq((await storage.get(`${key}.big`))?.length, big.length);
  await storage.delete(`${key}.big`);
});
await step("a map library", async () => {
  const lib = new MapLibrary(storage);
  const id = `check${Date.now()}`;
  await lib.save({ id, title: "check", created: new Date().toISOString(), context: { service: "pubmed" }, documents: [] });
  const listed = (await lib.list()).some((m) => m.id === id);
  await lib.delete(id);
  return expectEq(listed, true);
});
await step("delete it", async () => {
  await storage.delete(key);
  return expectEq(await storage.get(key), null);
});
await step(`CORS for ${appOrigin}`, async () => {
  const res = await fetch(`${new URL(parent).origin}/upload`, {
    method: "OPTIONS",
    headers: { origin: appOrigin, "access-control-request-method": "POST", "access-control-request-headers": "x-atomic-agent, x-atomic-public-key, x-atomic-signature, x-atomic-timestamp" },
  });
  const allow = res.headers.get("access-control-allow-origin");
  if (allow !== "*" && allow !== appOrigin) throw new Error(`the server does not allow ${appOrigin} (allow-origin: ${allow})`);
  return { allowOrigin: allow, allowHeaders: res.headers.get("access-control-allow-headers") };
});
console.log(failed ? `${failed} check(s) failed` : "all checks passed");
process.exit(failed ? 1 : 0);
