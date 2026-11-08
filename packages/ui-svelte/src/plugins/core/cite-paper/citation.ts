/// <reference path="./citation-js.d.ts" />
/**
 * Paper citations in APA, MLA, Chicago and ACM, as in the old map
 * (useCitationStyle.ts). citation-js and the styles load on first use, so
 * maps that never cite a paper don't download them.
 */
import type { MapState } from "../../../data/state.svelte";
import type { Paper } from "../../../data/types";

export interface CitationStyle {
	id: string;
	name: string;
	description: string;
	/** Text added after the formatted citation. */
	append?(paper: Paper): string;
}

export const citationStyles: CitationStyle[] = [
	{ id: "apa", name: "APA", description: "American Psychological Association 7th edition" },
	{ id: "mla", name: "MLA", description: "Modern Language Association 8th edition" },
	{ id: "chi", name: "Chicago", description: "Chicago Manual of Style 17th edition (author-date)" },
	{
		id: "acm",
		name: "ACM",
		description: 'ACM SIG Proceedings ("et al." for 3+ authors)',
		// Not part of ACM: the link when there is no DOI.
		append: (paper) => (paper.listLink && !paper.listLink.isDoi ? ` ${paper.listLink.address}` : ""),
	},
];

/** Document type (BASE, ORCID) to CSL type; the first match wins. */
const CSL_TYPES: Array<[string, string]> = [
	["Journal/newspaper article", "article-journal"],
	["Journal/newspaper other content", "article-journal"],
	["Journal/newspaper", "periodical"],
	["Book", "book"],
	["Book part", "chapter"],
	["Conference object", "paper-conference"],
	["Dataset", "dataset"],
	["Manuscript", "manuscript"],
	["Map", "map"],
	["Moving image/video", "motion_picture"],
	["Patent", "patent"],
	["Report", "report"],
	["Review", "review"],
	["Software", "software"],
	["Still image", "graphic"],
	["Thesis", "thesis"],
	["Thesis: bachelor", "thesis"],
	["Thesis: doctoral and postdoctoral", "thesis"],
	["Thesis: master", "thesis"],
	["Book chapter", "chapter"],
	["Conference paper", "paper-conference"],
	["Journal article", "article-journal"],
	["Dissertation thesis", "thesis"],
	["Working paper", "manuscript"],
	["Dissertation", "thesis"],
	["Book review", "review"],
	["Journal issue or edition", "article-journal"],
	["Magazine article", "article-journal"],
	["Newspaper article", "periodical"],
	["Moving image or video", "motion_picture"],
	["Cartographic material", "dataset"],
	["Edited book", "book"],
	["Newsletter article", "periodical"],
];

export function cslType(resultType: string[]): string | undefined {
	return CSL_TYPES.find(([type]) => resultType.includes(type))?.[1];
}

const optional = (v: unknown) => (v || v === 0 ? v : undefined);

/** The paper as CSL-JSON, the input citation-js formats. */
export function cslRecord(paper: Paper): Record<string, unknown> {
	const link = paper.listLink;
	return {
		id: paper.safeId,
		title: paper.title,
		author: paper.authors.map((a) => ({ given: a.firstName, family: a.lastName })),
		issued: [{ "date-parts": paper.year.split("-") }],
		"container-title": paper.raw.source,
		DOI: link?.isDoi ? link.address.replace(/(https?:\/\/)?(\w+\.)?doi.org\//, "") : undefined,
		URL: link && !link.isDoi ? link.address : undefined,
		type: cslType(paper.resultType),
		volume: optional(paper.raw.volume),
		issue: optional(paper.raw.issue),
		page: optional(paper.raw.page),
		ISSN: optional(paper.raw.issn),
	};
}

type CiteClass = typeof import("@citation-js/core").Cite;
let loading: Promise<CiteClass> | null = null;

function loadCitationJs(): Promise<CiteClass> {
	loading ??= (async () => {
		const [core, , apa, mla, chi, acm] = await Promise.all([
			import("@citation-js/core"),
			import("@citation-js/plugin-csl"),
			import("./csl/apa.csl?raw"),
			import("./csl/mla.csl?raw"),
			import("./csl/chicago.csl?raw"),
			import("./csl/acm.csl?raw"),
		]);
		const styles = core.plugins.config.get("@csl").styles;
		styles.add("okm-apa", apa.default);
		styles.add("okm-mla", mla.default);
		styles.add("okm-chi", chi.default);
		styles.add("okm-acm", acm.default);
		return core.Cite;
	})();
	return loading;
}

/** The paper's citation in a style, as plain text. */
export async function paperCitation(paper: Paper, style: CitationStyle): Promise<string> {
	const Cite = await loadCitationJs();
	const text = new Cite(cslRecord(paper)).format("bibliography", { style: `okm-${style.id}` }).trim();
	return text + (style.append?.(paper) ?? "");
}

/** Whether the map offers "Cite as" for the paper. */
export function canCite(map: MapState, paper: Paper): boolean {
	const excluded = map.config.noCitationDoctypes.map((t) => t.toLowerCase());
	return map.config.citePapers && !paper.resultType.some((t) => excluded.includes(t.toLowerCase()));
}

/** BASE gave no journal (published_in is just the source): the citation may be off. */
export function lowQualityCitation(map: MapState, paper: Paper): boolean {
	return (
		map.config.service === "base" && typeof paper.raw.source === "string" && paper.raw.published_in === paper.raw.source
	);
}
