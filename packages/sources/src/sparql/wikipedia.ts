/**
 * Wikipedia introductions as abstracts. Wikidata knows little more than a
 * one-line description of most things, and DBpedia's abstracts are often
 * missing, so records that link to a Wikipedia article can get the article's
 * first section from the MediaWiki API (which allows browsers: origin=*).
 */
import type { FetchFn } from "../http.js";
import type { SparqlRecord } from "./records.js";

export interface WikipediaOptions {
	fetch?: FetchFn;
	signal?: AbortSignal;
	/** Longest introduction kept, in characters (default 2000). */
	maxLength?: number;
	/** Replace abstracts that are shorter than this (default 200: Wikidata's one-liners). */
	replaceShorterThan?: number;
}

/** The API answers at most 20 introductions per request. */
const BATCH = 20;

const ARTICLE = /^https?:\/\/([a-z0-9-]+)\.(?:m\.)?wikipedia\.org\/wiki\/([^?#]+)/i;

/** { lang, title } of a Wikipedia article URL, or null. */
export function wikipediaArticle(url: string): { lang: string; title: string } | null {
	const m = ARTICLE.exec(url);
	if (!m) return null;
	let title = m[2];
	try {
		title = decodeURIComponent(title);
	} catch {
		// keep it encoded
	}
	return { lang: m[1].toLowerCase(), title: title.replace(/_/g, " ") };
}

const normal = (t: string) => t.replace(/_/g, " ").trim();

async function intros(lang: string, titles: string[], opts: WikipediaOptions): Promise<Map<string, string>> {
	const doFetch = opts.fetch ?? (globalThis.fetch as FetchFn);
	const params = new URLSearchParams({
		action: "query",
		format: "json",
		formatversion: "2",
		prop: "extracts",
		exintro: "1",
		explaintext: "1",
		exlimit: String(BATCH),
		redirects: "1",
		origin: "*",
		titles: titles.join("|"),
	});
	const res = await doFetch(`https://${lang}.wikipedia.org/w/api.php?${params}`, { signal: opts.signal });
	if (!res.ok) throw new Error(`Wikipedia answered ${res.status}`);
	const json = (await res.json()) as {
		query?: {
			normalized?: { from: string; to: string }[];
			redirects?: { from: string; to: string }[];
			pages?: { title: string; extract?: string; missing?: boolean }[];
		};
	};
	const q = json.query ?? {};
	const byTitle = new Map<string, string>();
	for (const p of q.pages ?? []) if (p.extract) byTitle.set(p.title, p.extract);
	// Follow the API's renames back to the titles that were asked for.
	const renamed = new Map<string, string>();
	for (const r of [...(q.normalized ?? []), ...(q.redirects ?? [])]) renamed.set(r.from, r.to);
	const out = new Map<string, string>();
	for (const t of titles) {
		let target = t;
		for (let i = 0; i < 3 && renamed.has(target); i++) target = renamed.get(target) as string;
		const text = byTitle.get(target);
		if (text) out.set(t, text);
	}
	return out;
}

/**
 * Fills in the abstracts of records that link to a Wikipedia article and
 * have none (or only a short description). A failed request leaves those
 * records as they were; returns how many abstracts were added.
 */
export async function addWikipediaIntros(papers: SparqlRecord[], opts: WikipediaOptions = {}): Promise<number> {
	const max = opts.maxLength ?? 2000;
	const shorter = opts.replaceShorterThan ?? 200;
	const wanted = new Map<string, Map<string, SparqlRecord[]>>();
	for (const p of papers) {
		if ((p.paper_abstract ?? "").length >= shorter) continue;
		const a = wikipediaArticle(String(p.url ?? ""));
		if (!a) continue;
		const byTitle = wanted.get(a.lang) ?? new Map<string, SparqlRecord[]>();
		const title = normal(a.title);
		byTitle.set(title, [...(byTitle.get(title) ?? []), p]);
		wanted.set(a.lang, byTitle);
	}
	let added = 0;
	for (const [lang, byTitle] of wanted) {
		const titles = [...byTitle.keys()];
		for (let i = 0; i < titles.length; i += BATCH) {
			let found: Map<string, string>;
			try {
				found = await intros(lang, titles.slice(i, i + BATCH), opts);
			} catch (err) {
				if (opts.signal?.aborted) throw err;
				continue;
			}
			for (const [title, text] of found) {
				const intro = text.replace(/\s+/g, " ").trim();
				if (!intro) continue;
				for (const p of byTitle.get(title) ?? []) {
					const short = p.paper_abstract?.trim();
					// Keep Wikidata's one-liner in front: it often says what the thing is.
					const full = short && !intro.toLowerCase().includes(short.toLowerCase()) ? `${short}. ${intro}` : intro;
					p.paper_abstract = full.length > max ? `${full.slice(0, max - 1).replace(/\s+\S*$/, "")}…` : full;
					added++;
				}
			}
		}
	}
	return added;
}
