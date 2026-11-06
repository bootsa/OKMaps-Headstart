import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SourceError } from "../src/errors.js";
import {
	cleanOpenaireSubject,
	getOpenaireProject,
	parseOpenaireProject,
	parseOpenaireXml,
	searchOpenaire,
	toOpenaireRecords,
} from "../src/openaire.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => fs.readFileSync(path.join(here, "fixtures/openaire", name), "utf8");
/** Outputs of test/golden/r/openaire_golden.R (openaire.R run on the same XML). */
const golden = (name: string) => JSON.parse(fs.readFileSync(path.join(here, "golden/openaire", name), "utf8"));

const pubs = fixture("publications.xml");
const datasets = fixture("datasets.xml");
const project = fixture("project.xml");
const EMPTY = "<response><header><total>0</total></header><results></results></response>";

type Golden = { metadata: Record<string, unknown>[]; text: { id: string; content: string }[] };

function expectLikeR(result: { papers: Record<string, unknown>[]; content: Record<string, string> }, g: Golden) {
	expect(result.papers).toHaveLength(g.metadata.length);
	result.papers.forEach((p, i) => {
		for (const [k, v] of Object.entries(g.metadata[i])) expect(p[k], `${i}.${k}`).toEqual(v);
		expect(result.content[g.text[i].id]).toBe(g.text[i].content);
	});
}

/** Answers OpenAIRE API calls from fixtures and records the URLs. */
function fakeApi(responses: Record<string, string | number>) {
	const urls: string[] = [];
	const fetch = async (url: string) => {
		urls.push(url);
		const path = new URL(url).pathname.replace(/^.*\/search\//, "");
		const body = responses[path];
		if (typeof body === "number") return new Response("error", { status: body });
		return new Response(body ?? EMPTY, { status: 200 });
	};
	return { urls, fetch };
}

describe("OpenAIRE records", () => {
	it("match openaire.R on saved publication and dataset responses", () => {
		const rows = [...parseOpenaireXml(pubs), ...parseOpenaireXml(datasets)];
		expectLikeR(toOpenaireRecords(rows), golden("search.json"));
	});

	it("clean subjects as preprocess_data does", () => {
		expect(cleanOpenaireSubject("[ INFO.INFO-MA ] Computer Science [cs]/Multiagent Systems [cs.MA]")).toBe(
			" Computer Science;Multiagent Systems ",
		);
		expect(cleanOpenaireSubject("High energy physics - lattice")).toBe("lattice");
		expect(cleanOpenaireSubject("dk/atira/pure/researchoutput/pubmedpublicationtype/D013486")).toBe("");
		expect(cleanOpenaireSubject("")).toBe("");
	});
});

describe("searchOpenaire", () => {
	it("checks the project, then fetches publications and datasets", async () => {
		const api = fakeApi({ projects: project, publications: pubs, datasets });
		const res = await searchOpenaire({ project_id: "643410", funder: "EC" }, { fetch: api.fetch });
		expectLikeR(res, golden("search.json"));
		expect(res.service).toBe("openaire");
		expect(res.query).toBe("643410");
		expect(api.urls).toEqual([
			"https://api.openaire.eu/search/projects?grantID=643410&funder=EC&size=1000&format=xml",
			"https://api.openaire.eu/search/publications?projectID=643410&funder=EC&size=1000&page=1&format=xml",
			"https://api.openaire.eu/search/datasets?projectID=643410&funder=EC&size=1000&format=xml",
		]);
	});

	it("treats a failed dataset request as no datasets", async () => {
		const api = fakeApi({ projects: project, publications: pubs, datasets: 500 });
		const res = await searchOpenaire({ project_id: "643410", funder: "EC" }, { fetch: api.fetch, retryDelayMs: 0 });
		expectLikeR(res, golden("search_pubs_only.json"));
	});

	it("uses a gateway endpoint when given", async () => {
		const api = fakeApi({ projects: project, publications: pubs });
		await searchOpenaire(
			{ project_id: "1", funder: "WT" },
			{ fetch: api.fetch, endpoint: "https://gw.example/openaire" },
		);
		expect(api.urls[0]).toBe("https://gw.example/openaire/search/projects?grantID=1&funder=WT&size=1000&format=xml");
	});

	it("reports an unknown project", async () => {
		const api = fakeApi({});
		const err = await searchOpenaire({ project_id: "0", funder: "EC" }, { fetch: api.fetch }).catch((e) => e);
		expect(err).toBeInstanceOf(SourceError);
		expect(err.message).toBe("Project not found.");
		expect(err.reasons).toEqual(["project id or funder id wrong"]);
	});

	it("reports a project without results", async () => {
		const api = fakeApi({ projects: project });
		const err = await searchOpenaire({ project_id: "643410", funder: "EC" }, { fetch: api.fetch }).catch((e) => e);
		expect(err.reasons).toEqual(["not enough results for project"]);
	});

	it("keeps datasets when a project has no publications", async () => {
		const api = fakeApi({ projects: project, datasets });
		const res = await searchOpenaire({ project_id: "643410", funder: "EC" }, { fetch: api.fetch });
		expect(res.papers.map((p) => p.resulttype)).toEqual(["dataset", "dataset"]);
	});

	it("reports an unreachable API", async () => {
		const fetch = async () => {
			throw new TypeError("Failed to fetch");
		};
		const err = await searchOpenaire({ project_id: "1", funder: "EC" }, { fetch, retryDelayMs: 0 }).catch((e) => e);
		expect(err.reasons).toEqual(["API error: OpenAIRE not reachable"]);
	});
});

describe("OpenAIRE project details", () => {
	it("match run_openaire_projectdata.R", () => {
		expect(parseOpenaireProject(project)).toEqual(golden("project.json"));
	});

	it("fetch the project by grant id", async () => {
		const api = fakeApi({ projects: project });
		const res = await getOpenaireProject({ project_id: "643410", funder: "EC" }, { fetch: api.fetch });
		expect(res.acronym).toBe("OpenAIRE2020");
		expect(api.urls).toEqual(["https://api.openaire.eu/search/projects?grantID=643410&funder=EC&size=1000&format=xml"]);
	});

	it("report a missing project", async () => {
		const api = fakeApi({});
		const err = await getOpenaireProject({ project_id: "0", funder: "EC" }, { fetch: api.fetch }).catch((e) => e);
		expect(err.reasons).toEqual(["project id or funder id wrong"]);
	});
});
