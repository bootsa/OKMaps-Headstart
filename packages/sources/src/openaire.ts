/**
 * OpenAIRE adaptor: the project search in openaire.R (get_papers) and the
 * project details in run_openaire_projectdata.R, both on OpenAIRE's search
 * API as ropenaire calls it.
 *
 * The subject clean-up patterns come from R's default regex engine (TRE):
 * "." also matches a newline, \w is Unicode, \d is ASCII, and a backslash
 * inside brackets is a literal backslash.
 */
import { SourceError, toSourceError } from "./errors.js";
import { fetchText, type HttpOptions, queryString } from "./http.js";
import { rLower, TRE_WORD as W } from "./rtext.js";
import type { SourceRecord, SourceResult } from "./types.js";
import { findAll, findFirst, parseXml, textOf, type XmlElement } from "./xml.js";

export const OPENAIRE_BASE = "https://api.openaire.eu/";

export interface OpenaireParams {
	/** Grant number of the project. */
	project_id: string;
	/** Funder short name: WT, EC, ARC, ANDS, NSF, FCT, NHMRC, ... */
	funder: string;
}

export interface OpenaireOptions extends HttpOptions {
	/** API base URL (default OPENAIRE_BASE); a gateway URL if the API is not reachable from the browser. */
	endpoint?: string;
}

export interface OpenairePaper extends SourceRecord {
	publisher: string;
	resulttype: string;
	language: string;
	link: string;
	fulltext: string;
	project_id: string;
	accessright: string;
	/** 1 for "Open Access", 0 otherwise. */
	oa_state: number;
}

/** The fields openaire.R reads from each result, with the first match taken. */
const FIELDS = {
	subject: ".//subject",
	title: ".//title",
	year: ".//dateofacceptance",
	publisher: ".//publisher",
	resulttype: ".//resulttype@classid",
	language: ".//language",
	published_in: ".//journal",
	link: ".//children/instance/webresource/url",
	fulltext: ".//fulltext",
	paper_abstract: ".//description",
	doi: './/pid[@classid="doi"]',
	project_id: ".//code",
	accessright: ".//bestaccessright@classname",
} as const;

type Raw = Record<keyof typeof FIELDS | "id" | "authors", string>;

/** xml_text(xml_find_first(...)): element text or attribute value, "" when missing (after NA filling). */
function first(context: XmlElement, path: string): string {
	const at = path.indexOf("@", path.lastIndexOf("/"));
	if (at > 0 && path[at - 1] !== "[") {
		const el = findFirst(context, path.slice(0, at));
		return el?.attrs[path.slice(at + 1)] ?? "";
	}
	const el = findFirst(context, path);
	return el ? textOf(el) : "";
}

/** parse_response: one row per result. */
export function parseOpenaireXml(xml: string): Raw[] {
	const root = parseXml(xml);
	return findAll(root, ".//results/result").map((result) => {
		const row = {} as Raw;
		for (const [name, path] of Object.entries(FIELDS)) row[name as keyof typeof FIELDS] = first(result, path);
		row.id = first(result, ".//dri:objIdentifier");
		row.doi = rLower(row.doi);
		row.authors = findAll(result, ".//creator").map(textOf).join("; ");
		return row;
	});
}

/** preprocess_data's subject steps, in order. */
const SUBJECT_STEPS: [RegExp, string][] = [
	[/\[[A-Za-z \\.-]+\]/gu, ""],
	[/ ?\//gu, ";"],
	[/:.*::/gsu, ""],
	[/Q[A-Z]?[0-9]{1,2}.*\. ?/gsu, ""],
	[/QA[0-9]{1,2}/gu, ""],
	[/[0-9]+\.[0-9]+/gu, ""],
	[/info:eu-repo;classification;ddc;[0-9]+/gu, ""],
	[new RegExp(`info:eu-repo;classification;acm;${W}+.[0-9]+.[0-9]+ `, "gsu"), ""],
	[/ddc:[0-9]+/gu, ""],
	[/jel:[A-Z]+[0-9]+/gu, ""],
	[/[A-Z]{2}[0-9]+-[0-9]+/gu, ""],
	[new RegExp(`${W}*::`, "gu"), ""],
	[new RegExp(`${W}+_[A-Z]+-?[A-Z]+`, "gu"), ""],
	[/.*- /gsu, ""],
];

/** The subject clean-up of preprocess_data in openaire.R. */
export function cleanOpenaireSubject(subject: string): string {
	let s = subject;
	for (const [re, by] of SUBJECT_STEPS) s = s.replace(re, by);
	if (s.includes("pubmedpublicationtype")) return "";
	return s.replace(/&gt|&lt/g, "");
}

/** get_return_values: the records and clustering text sent to the map pipeline. */
export function toOpenaireRecords(rows: Raw[]): { papers: OpenairePaper[]; content: Record<string, string> } {
	const papers = rows.map((r) => ({
		...r,
		subject_orig: r.subject,
		subject: cleanOpenaireSubject(r.subject),
		paper_abstract: r.paper_abstract.replace(/\n/g, " "),
		doi: r.doi.replace(/[\r\n\t]/g, ""),
		oa_state: r.accessright === "Open Access" ? 1 : 0,
		url: r.id,
	}));
	const content: Record<string, string> = {};
	for (const p of papers) content[p.id] = [p.title, p.paper_abstract, p.subject, p.authors, p.year].join(" ");
	return { papers, content };
}

function apiUrl(opts: OpenaireOptions, path: string, query: Record<string, string | number>): string {
	const base = opts.endpoint ?? OPENAIRE_BASE;
	return `${base}${base.endsWith("/") ? "" : "/"}${path}?${queryString(query)}`;
}

const countResults = (xml: string) => findAll(parseXml(xml), ".//results/result").length;

/**
 * Runs an OpenAIRE project search: checks that the project exists, then
 * fetches its publications and datasets (up to 1000 each).
 */
export async function searchOpenaire(
	params: OpenaireParams,
	opts: OpenaireOptions = {},
): Promise<SourceResult & { papers: OpenairePaper[] }> {
	const { project_id: projectId, funder } = params;
	try {
		const projects = await fetchText(
			apiUrl(opts, "search/projects", { grantID: projectId, funder, size: 1000, format: "xml" }),
			{},
			opts,
		);
		if (countResults(projects) === 0) throw new Error("Project not found.");

		// A failed or empty publication or dataset request counts as no results, as in R.
		const fetchResults = async (path: string, extra: Record<string, number>) => {
			try {
				const xml = await fetchText(
					apiUrl(opts, path, { projectID: projectId, funder, size: 1000, ...extra, format: "xml" }),
					{},
					opts,
				);
				return parseOpenaireXml(xml);
			} catch (err) {
				if (opts.signal?.aborted) throw err;
				return [];
			}
		};
		const [pubs, datasets] = await Promise.all([
			fetchResults("search/publications", { page: 1 }),
			fetchResults("search/datasets", {}),
		]);
		const rows = [...pubs, ...datasets];
		if (rows.length === 0) throw new Error("No results retrieved.");
		return { service: "openaire", query: projectId, ...toOpenaireRecords(rows) };
	} catch (err) {
		if (err instanceof SourceError) throw err;
		throw toSourceError("openaire", err);
	}
}

export interface OpenaireOrganisation {
	name?: string;
	long_name?: string;
	website?: string;
	org_id: string;
	url: string;
}

export interface OpenaireProject {
	grantID: string;
	acronym: string;
	title: string;
	start_date: string;
	end_date: string;
	call_id: string;
	special_clause: string;
	funding_level_0: string;
	oa_mandate: string;
	obj_id: string;
	openaire_link: string;
	organisations: OpenaireOrganisation[];
	/** funding_level_2, _1 and _0 names per result; null where missing. */
	funding_tree: (string | null)[];
}

const PROJECT_NODES = {
	grantID: ".//code",
	acronym: ".//acronym",
	title: ".//title",
	start_date: ".//startdate",
	end_date: ".//enddate",
	call_id: ".//callidentifier",
	special_clause: ".//ecsc39",
	funding_level_0: ".//funding_level_0/name",
	oa_mandate: ".//oamandatepublications",
	obj_id: ".//header/dri:objIdentifier",
	openaire_link: ".//websiteurl",
} as const;

/** First match's text, or null when missing or empty (`%|m|% NA`). */
function firstOrNull(context: XmlElement, path: string): string | null {
	const el = findFirst(context, path);
	const text = el ? textOf(el) : "";
	return text === "" ? null : text;
}

const ORG_PREFIX = "https://www.openaire.eu/search/organization?organizationId=";

/** parse_project in run_openaire_projectdata.R. */
export function parseOpenaireProject(xml: string): OpenaireProject {
	const root = parseXml(xml);
	const results = findAll(root, ".//results/result");
	if (results.length === 0) throw new Error("No project metadata found.");
	const project = {} as Record<keyof typeof PROJECT_NODES, string>;
	for (const [name, path] of Object.entries(PROJECT_NODES)) {
		project[name as keyof typeof PROJECT_NODES] = firstOrNull(results[0], path) ?? "";
	}
	const funding_tree = results.flatMap((r) => {
		const trees = findAll(r, ".//fundingtree");
		return [2, 1, 0].map((level) => {
			const hit = trees.flatMap((t) => findAll(t, `.//funding_level_${level}/name`))[0];
			const text = hit ? textOf(hit) : "";
			return text === "" ? null : text;
		});
	});
	const organisations = findAll(root, ".//rels/rel").map((rel) => {
		const org: OpenaireOrganisation = { org_id: "", url: "" };
		const name = firstOrNull(rel, ".//legalshortname");
		const longName = firstOrNull(rel, ".//legalname");
		const website = firstOrNull(rel, ".//websiteurl");
		if (name !== null) org.name = name;
		if (longName !== null) org.long_name = longName;
		if (website !== null) org.website = website;
		org.org_id = ORG_PREFIX + (firstOrNull(rel, ".//to") ?? "NA");
		org.url = website ?? org.org_id;
		return org;
	});
	return { ...project, organisations, funding_tree };
}

/** Fetches the details shown in the header of a project map. */
export async function getOpenaireProject(params: OpenaireParams, opts: OpenaireOptions = {}): Promise<OpenaireProject> {
	try {
		const xml = await fetchText(
			apiUrl(opts, "search/projects", { grantID: params.project_id, funder: params.funder, size: 1000, format: "xml" }),
			{},
			opts,
		);
		return parseOpenaireProject(xml);
	} catch (err) {
		if (opts.signal?.aborted) throw err;
		// run_openaire_projectdata.R reports every failure as an unknown project.
		throw new SourceError("openaire", "Project not found.", ["project id or funder id wrong"]);
	}
}
