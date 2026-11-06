/**
 * Atomic Data servers (atomic-server 0.40/0.41): each document is a File
 * resource under a parent resource (a Drive or Folder the agent may write).
 *
 * Bodies go up through the /upload endpoint (multipart, so maps of several
 * hundred KB are fine) and come back from each File's downloadURL. Replacing
 * a document uploads the new file and then destroys the old one with a
 * signed Commit. Requests are signed as @tomic/lib signs them: Ed25519 over
 * "<url> <ms timestamp>" in x-atomic-* headers.
 *
 * Needs an agent: its subject and its base64 Ed25519 private key, or the
 * "secret" the Atomic data browser shows under User settings.
 */
import { checkKey, checkPrefix, type FetchFn, type MapStorage, StorageError } from "./types.ts";

export interface AtomicAgent {
	/** The agent's URL, e.g. https://example.org/agents/abc… */
	subject: string;
	/** Base64 of the 32-byte Ed25519 private key (seed). */
	privateKey: string;
}

export interface AtomicOptions {
	/** The resource documents go under, e.g. https://example.org/drive/okmaps */
	parent: string;
	agent: AtomicAgent;
	fetch?: FetchFn;
}

const P = {
	isA: "https://atomicdata.dev/properties/isA",
	parent: "https://atomicdata.dev/properties/parent",
	filename: "https://atomicdata.dev/properties/filename",
	downloadUrl: "https://atomicdata.dev/properties/downloadURL",
	lastCommit: "https://atomicdata.dev/properties/lastCommit",
	members: "https://atomicdata.dev/properties/collection/members",
	totalPages: "https://atomicdata.dev/properties/collection/totalPages",
	commit: {
		subject: "https://atomicdata.dev/properties/subject",
		destroy: "https://atomicdata.dev/properties/destroy",
		previousCommit: "https://atomicdata.dev/properties/previousCommit",
		createdAt: "https://atomicdata.dev/properties/createdAt",
		signer: "https://atomicdata.dev/properties/signer",
		signature: "https://atomicdata.dev/properties/signature",
	},
};
const COMMIT_CLASS = "https://atomicdata.dev/classes/Commit";
const JSON_AD = "application/ad+json";

/** Reads the secret the Atomic data browser shows: base64 JSON {privateKey, subject}. */
export function agentFromSecret(secret: string): AtomicAgent {
	try {
		const { privateKey, subject } = JSON.parse(atob(secret.trim()));
		if (typeof privateKey === "string" && typeof subject === "string") return { privateKey, subject };
	} catch {
		// reported below
	}
	throw new StorageError("that is not an Atomic Data agent secret");
}

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (s: string) =>
	b64(unb64(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4)));

/** An Ed25519 signer from a raw 32-byte seed, with WebCrypto (browsers, Node 20+). */
export async function ed25519(privateKeyBase64: string) {
	const seed = unb64(privateKeyBase64);
	if (seed.length !== 32) throw new StorageError("an Atomic Data private key is 32 bytes");
	// PKCS#8 wrapping of a raw Ed25519 seed (RFC 8410).
	const pkcs8 = new Uint8Array([
		0x30,
		0x2e,
		0x02,
		0x01,
		0x00,
		0x30,
		0x05,
		0x06,
		0x03,
		0x2b,
		0x65,
		0x70,
		0x04,
		0x22,
		0x04,
		0x20,
		...seed,
	]);
	const key = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, true, ["sign"]);
	const jwk = await crypto.subtle.exportKey("jwk", key);
	return {
		publicKey: b64url(jwk.x!),
		sign: async (message: string) =>
			b64(new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, key, new TextEncoder().encode(message)))),
	};
}

/** JSON with keys sorted at every level, as fast-json-stable-stringify writes it. */
export function stableStringify(v: unknown): string {
	if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? "null" : stableStringify(x))).join(",")}]`;
	if (v && typeof v === "object") {
		const o = v as Record<string, unknown>;
		return `{${Object.keys(o)
			.sort()
			.filter((k) => o[k] !== undefined)
			.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
			.join(",")}}`;
	}
	return JSON.stringify(v);
}

interface FileEntry {
	subject: string;
	filename: string;
	downloadUrl: string;
	lastCommit?: string;
}

/** Keys hold "/", which file names should not: encode them. */
const fileName = (key: string) => encodeURIComponent(key);
const keyOf = (name: string) => {
	try {
		return decodeURIComponent(name);
	} catch {
		return name;
	}
};

export function atomicStorage(opts: AtomicOptions): MapStorage {
	const parent = opts.parent.replace(/\/$/, "");
	const server = new URL(parent).origin;
	const doFetch = opts.fetch ?? ((u, i) => fetch(u, i));
	const signer = ed25519(opts.agent.privateKey);

	async function signed(url: string, init: RequestInit = {}): Promise<Response> {
		const { publicKey, sign } = await signer;
		const timestamp = Date.now();
		const headers = new Headers(init.headers);
		headers.set("x-atomic-public-key", publicKey);
		headers.set("x-atomic-signature", await sign(`${url} ${timestamp}`));
		headers.set("x-atomic-timestamp", String(timestamp));
		headers.set("x-atomic-agent", opts.agent.subject);
		return doFetch(url, { ...init, headers });
	}

	async function readJson(url: string): Promise<Record<string, unknown>> {
		const res = await signed(url, { headers: { accept: JSON_AD } });
		if (!res.ok)
			throw new StorageError(
				`Atomic Data GET ${url} failed (${res.status}): ${(await res.text()).slice(0, 200)}`,
				res.status,
			);
		return res.json();
	}

	const entry = (r: Record<string, unknown>): FileEntry | null =>
		typeof r[P.filename] === "string" && typeof r[P.downloadUrl] === "string"
			? {
					subject: String(r["@id"]),
					filename: r[P.filename] as string,
					downloadUrl: r[P.downloadUrl] as string,
					lastCommit: r[P.lastCommit] as string | undefined,
				}
			: null;

	/** The files directly under the parent, by key. */
	async function files(): Promise<Map<string, FileEntry[]>> {
		const out = new Map<string, FileEntry[]>();
		for (let page = 0, pages = 1; page < pages; page++) {
			const q = new URL(`${server}/query`);
			q.searchParams.set("property", P.parent);
			q.searchParams.set("value", parent);
			q.searchParams.set("include_nested", "true");
			q.searchParams.set("page_size", "200");
			q.searchParams.set("current_page", String(page));
			const coll = await readJson(q.href);
			pages = Number(coll[P.totalPages] ?? 1);
			for (const m of (coll[P.members] as unknown[]) ?? []) {
				// Members come nested with include_nested; older servers give subjects.
				const r = typeof m === "string" ? await readJson(m) : (m as Record<string, unknown>);
				const f = entry(r);
				if (!f) continue;
				const key = keyOf(f.filename);
				out.set(key, [...(out.get(key) ?? []), f]);
			}
		}
		return out;
	}

	async function destroy(f: FileEntry): Promise<void> {
		const { sign } = await signer;
		const commit: Record<string, unknown> = {
			[P.isA]: [COMMIT_CLASS],
			[P.commit.subject]: f.subject,
			[P.commit.destroy]: true,
			[P.commit.createdAt]: Date.now(),
			[P.commit.signer]: opts.agent.subject,
		};
		if (f.lastCommit) commit[P.commit.previousCommit] = f.lastCommit;
		commit[P.commit.signature] = await sign(stableStringify(commit));
		const res = await doFetch(`${server}/commit`, {
			method: "POST",
			headers: { "content-type": JSON_AD },
			body: stableStringify(commit),
		});
		if (res.status !== 200 && res.status !== 404)
			throw new StorageError(
				`Atomic Data commit failed (${res.status}): ${(await res.text()).slice(0, 200)}`,
				res.status,
			);
	}

	return {
		label: `Atomic Data (${parent})`,
		async get(key) {
			const [f] = (await files()).get(checkKey(key)) ?? [];
			if (!f) return null;
			const res = await signed(new URL(f.downloadUrl, server).href);
			if (res.status === 404) return null;
			if (!res.ok) throw new StorageError(`Atomic Data download failed (${res.status})`, res.status);
			return res.text();
		},
		async put(key, body, contentType = "application/json") {
			const old = (await files()).get(checkKey(key)) ?? [];
			const url = new URL(`${server}/upload`);
			url.searchParams.set("parent", parent);
			const form = new FormData();
			form.append("assets", new Blob([body], { type: contentType }), fileName(key));
			const res = await signed(url.href, { method: "POST", body: form });
			if (!res.ok)
				throw new StorageError(
					`Atomic Data upload failed (${res.status}): ${(await res.text()).slice(0, 200)}`,
					res.status,
				);
			// The new file is in place: remove the ones it replaces.
			for (const f of old) await destroy(f);
		},
		async delete(key) {
			for (const f of (await files()).get(checkKey(key)) ?? []) await destroy(f);
		},
		async list(prefix = "") {
			checkPrefix(prefix);
			return [...(await files()).keys()]
				.filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes("/"))
				.sort();
		},
	};
}
