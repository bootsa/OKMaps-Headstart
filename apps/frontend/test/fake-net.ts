/**
 * Recorded provider answers for tests: PubMed (E-utilities), Crossref, the
 * gateway's BASE routes and OpenAIRE. Used by the Node tests and by the
 * browser test, which routes the page's requests here.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.resolve(here, "../../../packages/sources/test/fixtures");
const read = (p: string) => fs.readFileSync(path.join(fixtures, p), "utf8");

export const GATEWAY = "https://gateway.test";
/** Where the Node tests read the AQUANAVI facility table. */
export const PLACES = "https://data.test/aquanavi.csv";

const efetch = read("pubmed_efetch.xml");
const pmids = [...efetch.matchAll(/<PMID[^>]*>(\d+)<\/PMID>/g)].map((m) => m[1]);
const esearch = JSON.stringify({
	esearchresult: { count: "5", retmax: "5", webenv: "MCID_1", querykey: "1", idlist: pmids },
});
const esummary = JSON.stringify({
	result: {
		uids: pmids,
		...Object.fromEntries(pmids.map((id, i) => [id, { uid: id, pmcrefcount: i, articleids: [] }])),
	},
});
// One page only: numFound set to the page's size so the adaptor does not ask for more.
const base = zlib
	.gunzipSync(fs.readFileSync(path.join(fixtures, "base/base_digital_education.xml.gz")))
	.toString("utf8")
	.replace(/numFound="\d+"/, `numFound="117"`);
// The content provider list the old Python worker used (workers/common/common/contentproviders.json),
// so journal fields are split out as on the server.
const escapeXml = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const providers = JSON.parse(
	zlib.gunzipSync(fs.readFileSync(path.join(fixtures, "contentproviders.json.gz"))).toString("utf8"),
) as Array<{ name: string; internal_name: string }>;
const repositories = `<?xml version="1.0" encoding="UTF-8"?><collection><list_repositories>${providers
	.map(
		(p) =>
			`<repository><name>${escapeXml(p.name)}</name><internal_name>${escapeXml(p.internal_name)}</internal_name></repository>`,
	)
	.join("")}</list_repositories></collection>`;

/** The answer to a request, or null for a URL these tests don't know. */
export function fakeAnswer(url: string): { body: string; type: string } | null {
	const u = new URL(url);
	const xml = (body: string) => ({ body, type: "text/xml; charset=UTF-8" });
	const json = (body: string) => ({ body, type: "application/json" });
	if (u.hostname === "eutils.ncbi.nlm.nih.gov") {
		if (u.pathname.endsWith("esearch.fcgi")) return json(esearch);
		if (u.pathname.endsWith("efetch.fcgi")) return xml(efetch);
		if (u.pathname.endsWith("esummary.fcgi")) return json(esummary);
	}
	if (u.hostname === "api.crossref.org" && u.pathname === "/works") {
		const dois = (u.searchParams.get("filter") ?? "").split(",").map((f) => f.replace(/^doi:/, ""));
		return json(
			JSON.stringify({ message: { items: dois.map((d, i) => ({ DOI: d, "is-referenced-by-count": 10 + i })) } }),
		);
	}
	if (url === PLACES) return { body: read("places/aquanavi.csv"), type: "text/csv" };
	if (url.startsWith(`${GATEWAY}/base/search`)) return xml(base);
	if (url.startsWith(`${GATEWAY}/base/repositories`)) return xml(repositories);
	if (u.hostname === "zenodo.org" && /^\/api\/(communities\/[^/]+\/)?records$/.test(u.pathname))
		return json(read("zenodo/coral-reef-datasets.json"));
	if (u.hostname === "dbpedia.org" && u.pathname === "/sparql")
		return { body: read("sparql/dbpedia-coral-reef.json"), type: "application/sparql-results+json" };
	if (u.hostname === "en.wikipedia.org" && u.pathname === "/w/api.php") {
		const titles = (u.searchParams.get("titles") ?? "").split("|");
		const pages = titles.map((title) => ({ title, extract: `${title} is a thing about coral reefs and the sea.` }));
		return json(JSON.stringify({ query: { pages } }));
	}
	if (u.hostname === "api.zotero.org") {
		// The public "pastas" group, and a key that can read it and a library of its own.
		if (u.pathname === "/keys/current")
			return json(JSON.stringify({ userID: 45, username: "steph", access: { user: { library: true } } }));
		if (u.pathname === "/users/45/groups") return json(JSON.stringify([{ id: 4846685, data: { name: "pastas" } }]));
		if (u.pathname === "/groups/4846685/collections") return json(read("zotero/pastas-collections.json"));
		if (/^\/groups\/4846685\/(collections\/8UG7PVLY\/)?items\/top$/.test(u.pathname))
			return json(read("zotero/pastas-references.json"));
	}
	if (u.hostname === "api.openalex.org" && u.pathname === "/works") {
		const first = u.searchParams.get("cursor") === "*";
		return json(read(`openalex/works-coral-bleaching-${first ? 1 : 2}.json`));
	}
	if (u.hostname === "api.openaire.eu") {
		const kind = u.pathname.replace(/^.*\/search\//, "");
		const file = { projects: "project.xml", publications: "publications.xml", datasets: "datasets.xml" }[kind];
		if (file) return xml(read(`openaire/${file}`));
	}
	return null;
}

/** fakeAnswer as a fetch function. */
export const fakeFetch = async (url: string) => {
	const a = fakeAnswer(url);
	return a ? new Response(a.body, { headers: { "content-type": a.type } }) : new Response("not found", { status: 404 });
};
