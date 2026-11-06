/**
 * In-memory stand-ins for a WebDAV server, a Solid server and an R2 bucket,
 * behaving as the real ones do in the ways the adaptors depend on
 * (409 for a missing parent folder, containers created on PUT, …).
 */
import { createPublicKey, verify as cryptoVerify } from "node:crypto";
import type { FetchFn, ObjectBucket } from "../src/index.ts";

type Tree = Map<string, string | null>; // path -> body, or null for a folder

const parent = (p: string) => p.replace(/[^/]+\/?$/, "");

export function fakeWebdav(origin: string, root = "/dav/"): { fetch: FetchFn; tree: Tree; calls: string[] } {
	const tree: Tree = new Map([[root, null]]);
	const calls: string[] = [];
	const fetch: FetchFn = async (input, init = {}) => {
		const url = new URL(input);
		const method = init.method ?? "GET";
		const p = decodeURIComponent(url.pathname);
		calls.push(`${method} ${p}`);
		const headers = new Headers(init.headers);
		if (headers.get("authorization") !== `Basic ${btoa("me:secret")}`) return new Response(null, { status: 401 });
		switch (method) {
			case "GET": {
				const body = tree.get(p);
				return typeof body === "string" ? new Response(body) : new Response(null, { status: 404 });
			}
			case "PUT":
				if (tree.get(parent(p)) !== null) return new Response(null, { status: 409 });
				tree.set(p, String(init.body));
				return new Response(null, { status: 201 });
			case "MKCOL":
				if (tree.has(p)) return new Response(null, { status: 405 });
				if (tree.get(parent(p)) !== null) return new Response(null, { status: 409 });
				tree.set(p, null);
				return new Response(null, { status: 201 });
			case "DELETE":
				if (!tree.has(p)) return new Response(null, { status: 404 });
				tree.delete(p);
				return new Response(null, { status: 204 });
			case "PROPFIND": {
				if (tree.get(p) !== null) return new Response(null, { status: 404 });
				const kids = [...tree.keys()].filter((k) => k !== p && parent(k) === p);
				// Like Nextcloud: "d:" prefix, hrefs percent-encoded, the folder itself listed first.
				const entry = (k: string) =>
					`<d:response><d:href>${encodeURI(k)}</d:href><d:propstat><d:prop><d:resourcetype>${tree.get(k) === null ? "<d:collection/>" : ""}</d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;
				return new Response(
					`<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">${[p, ...kids].map(entry).join("")}</d:multistatus>`,
					{ status: 207 },
				);
			}
		}
		return new Response(null, { status: 405 });
	};
	return { fetch, tree, calls };
}

export function fakeSolid(origin: string, root = "/pod/"): { fetch: FetchFn; tree: Tree } {
	const tree: Tree = new Map([[root, null]]);
	const fetch: FetchFn = async (input, init = {}) => {
		const url = new URL(input);
		const method = init.method ?? "GET";
		const p = decodeURIComponent(url.pathname);
		if (!p.startsWith(root)) return new Response(null, { status: 403 });
		switch (method) {
			case "GET": {
				const body = tree.get(p);
				if (body === undefined) return new Response(null, { status: 404 });
				if (body !== null) return new Response(body);
				// Community Solid Server style Turtle, relative IRIs.
				const kids = [...tree.keys()]
					.filter((k) => k !== p && parent(k) === p)
					.map((k) => `<${encodeURI(k.slice(p.length))}>`);
				const turtle = `@prefix dc: <http://purl.org/dc/terms/>.\n@prefix ldp: <http://www.w3.org/ns/ldp#>.\n\n<> a ldp:Container, ldp:BasicContainer, ldp:Resource${kids.length ? `;\n    ldp:contains ${kids.join(", ")}` : ""}.\n`;
				return new Response(turtle, { headers: { "content-type": "text/turtle" } });
			}
			case "PUT": {
				// Solid creates the containers above a resource.
				for (let q = parent(p); q.length >= root.length && !tree.has(q); q = parent(q)) tree.set(q, null);
				tree.set(p, String(init.body));
				return new Response(null, { status: 201 });
			}
			case "DELETE":
				if (!tree.has(p)) return new Response(null, { status: 404 });
				tree.delete(p);
				return new Response(null, { status: 205 });
		}
		return new Response(null, { status: 405 });
	};
	return { fetch, tree };
}

export function fakeBucket(): ObjectBucket {
	const objects = new Map<string, string>();
	return {
		get: async (k) => (objects.has(k) ? { text: async () => objects.get(k)! } : null),
		put: async (k, v) => void objects.set(k, v),
		delete: async (k) => void objects.delete(k),
		// Two keys per page, to exercise the cursor.
		list: async ({ prefix = "", cursor } = {}) => {
			const keys = [...objects.keys()].filter((k) => k.startsWith(prefix)).sort();
			const start = cursor ? Number(cursor) : 0;
			const page = keys.slice(start, start + 2);
			const truncated = start + 2 < keys.length;
			return { objects: page.map((key) => ({ key })), truncated, cursor: truncated ? String(start + 2) : undefined };
		},
	};
}

/**
 * An Atomic Data server (atomic-server 0.41 as @tomic/lib talks to it):
 * signed requests (x-atomic-* headers, Ed25519 over "<url> <timestamp>"),
 * /upload creating File resources, /query collections with nested members,
 * downloads, and /commit taking destroy Commits. Signatures are checked with
 * Node's own Ed25519, over the canonical JSON the server would rebuild.
 * Only the agent `agent` may read or write.
 */
export function fakeAtomic(origin: string, agent: { subject: string; publicKey: string }) {
	type Res = Record<string, unknown>;
	const resources = new Map<string, Res>();
	const blobs = new Map<string, string>();
	const log: string[] = [];
	let n = 0;
	const pub = createPublicKey({
		key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(agent.publicKey, "base64")]),
		format: "der",
		type: "spki",
	});
	const verify = (message: string, sig: string) =>
		cryptoVerify(null, Buffer.from(message), pub, Buffer.from(sig, "base64"));
	const sorted = (v: unknown): unknown =>
		Array.isArray(v)
			? v.map(sorted)
			: v && typeof v === "object"
				? Object.fromEntries(
						Object.keys(v)
							.sort()
							.map((k) => [k, sorted((v as Res)[k])]),
					)
				: v;
	const json = (body: unknown, status = 200) =>
		new Response(JSON.stringify(body), { status, headers: { "content-type": "application/ad+json" } });
	const authorised = (url: string, h: Headers) => {
		const t = Number(h.get("x-atomic-timestamp"));
		return (
			h.get("x-atomic-agent") === agent.subject &&
			h.get("x-atomic-public-key") === agent.publicKey &&
			Math.abs(Date.now() - t) < 60_000 &&
			verify(`${url} ${t}`, h.get("x-atomic-signature") ?? "")
		);
	};
	const fetch: FetchFn = async (input, init = {}) => {
		const url = new URL(input);
		const method = init.method ?? "GET";
		const headers = new Headers(init.headers);
		log.push(`${method} ${url.pathname}`);
		if (url.pathname === "/commit" && method === "POST") {
			const commit = JSON.parse(String(init.body)) as Res;
			const { "https://atomicdata.dev/properties/signature": sig, ...unsigned } = commit;
			if (
				commit["https://atomicdata.dev/properties/signer"] !== agent.subject ||
				!verify(JSON.stringify(sorted(unsigned)), String(sig))
			) {
				return new Response("invalid signature", { status: 400 });
			}
			const subject = String(commit["https://atomicdata.dev/properties/subject"]);
			const target = resources.get(subject);
			if (!target) return new Response("not found", { status: 404 });
			if (
				commit["https://atomicdata.dev/properties/previousCommit"] !==
				target["https://atomicdata.dev/properties/lastCommit"]
			) {
				return new Response("previousCommit does not match lastCommit", { status: 400 });
			}
			if (commit["https://atomicdata.dev/properties/destroy"] !== true)
				return new Response("only destroy is simulated", { status: 400 });
			resources.delete(subject);
			return json({ ...commit, "@id": `${origin}/commits/${++n}` });
		}
		if (!authorised(url.href, headers)) return new Response("unauthorised", { status: 401 });
		if (url.pathname === "/upload" && method === "POST") {
			const parentSubject = url.searchParams.get("parent")!;
			const created: Res[] = [];
			for (const file of (init.body as FormData).getAll("assets") as File[]) {
				const id = `${++n}`;
				const subject = `${origin}/files/${id}`;
				blobs.set(id, await file.text());
				const r: Res = {
					"@id": subject,
					"https://atomicdata.dev/properties/isA": ["https://atomicdata.dev/classes/File"],
					"https://atomicdata.dev/properties/parent": parentSubject,
					"https://atomicdata.dev/properties/filename": file.name,
					"https://atomicdata.dev/properties/downloadURL": `${origin}/download/files/${id}`,
					"https://atomicdata.dev/properties/lastCommit": `${origin}/commits/${++n}`,
				};
				resources.set(subject, r);
				created.push(r);
			}
			return json(created);
		}
		if (url.pathname === "/query") {
			const members = [...resources.values()].filter(
				(r) => r[url.searchParams.get("property")!] === url.searchParams.get("value"),
			);
			const size = Number(url.searchParams.get("page_size") ?? 30);
			const page = Number(url.searchParams.get("current_page") ?? 0);
			const nested = url.searchParams.get("include_nested") === "true";
			const slice = members.slice(page * size, (page + 1) * size);
			return json({
				"@id": url.href,
				"https://atomicdata.dev/properties/collection/members": nested ? slice : slice.map((r) => r["@id"]),
				"https://atomicdata.dev/properties/collection/totalPages": Math.max(1, Math.ceil(members.length / size)),
			});
		}
		if (url.pathname.startsWith("/download/files/")) {
			const body = blobs.get(url.pathname.slice("/download/files/".length));
			return body === undefined ||
				![...resources.values()].some((r) => r["https://atomicdata.dev/properties/downloadURL"] === url.href)
				? new Response("not found", { status: 404 })
				: new Response(body);
		}
		const r = resources.get(url.href);
		return r ? json(r) : new Response("not found", { status: 404 });
	};
	return { fetch, resources, log };
}
