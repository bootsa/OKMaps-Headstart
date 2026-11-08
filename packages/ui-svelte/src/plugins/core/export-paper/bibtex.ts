/**
 * BibTeX for a paper, built in the browser. It follows the old export
 * service (server/workers/api/src/apis/export.py on the legacy-server
 * branch): the same entry types, fields and layout as bibtexparser wrote.
 */
import type { Paper } from "@okmaps/core";

/**
 * Document type (BASE, PubMed, ORCID) to BibTeX entry type. Later entries
 * win, as in the old service's dict; unknown types are "article".
 */
const ENTRY_TYPES: Record<string, string> = Object.fromEntries([
	["Audio", "audio"],
	["Book", "book"],
	["Book part", "inbook"],
	["Conference object", "inproceedings"],
	["Course material", "misc"],
	["Dataset", "misc"],
	["Image/video", "misc"],
	["Journal/newspaper", "misc"],
	["Journal/newspaper article", "article"],
	["Journal/newspaper other content", "misc"],
	["Lecture", "misc"],
	["Manuscript", "unpublished"],
	["Map", "misc"],
	["Moving image/video", "video"],
	["Musical notation", "misc"],
	["Other/Unknown material", "misc"],
	["Patent", "patent"],
	["Report", "techreport"],
	["Review", "misc"],
	["Software", "software"],
	["Still image", "misc"],
	["Text", "misc"],
	["Thesis", "thesis"],
	["Thesis: bachelor", "thesis"],
	["Thesis: doctoral and postdoctoral", "phdthesis"],
	["Thesis: master", "mastersthesis"],
	["Adaptive Clinical Trial", "misc"],
	["Address", "misc"],
	["Autobiography", "book"],
	["Bibliography", "misc"],
	["Biography", "book"],
	["Book Illustrations", "misc"],
	["Case Reports", "misc"],
	["Classical Article", "article"],
	["Clinical Conference", "conference"],
	["Clinical Study", "misc"],
	["Clinical Trial", "misc"],
	["Clinical Trial Protocol", "misc"],
	["Clinical Trial, Phase I", "misc"],
	["Clinical Trial, Phase II", "misc"],
	["Clinical Trial, Phase III", "misc"],
	["Clinical Trial, Phase IV", "misc"],
	["Clinical Trial, Veterinary", "misc"],
	["Collected Work", "misc"],
	["Collected Works", "misc"],
	["Comment", "misc"],
	["Comparative Study", "misc"],
	["Congress", "conference"],
	["Consensus Development Conference", "conference"],
	["Consensus Development Conference, NIH", "conference"],
	["Controlled Clinical Trial", "misc"],
	["Corrected and Republished Article", "article"],
	["Dictionary", "misc"],
	["Directory", "misc"],
	["Duplicate Publication", "misc"],
	["Editorial", "article"],
	["Electronic Supplementary Materials", "electronic"],
	["English Abstract", "misc"],
	["Ephemera", "misc"],
	["Equivalence Trial", "misc"],
	["Evaluation Studies", "misc"],
	["Evaluation Study", "misc"],
	["Expression of Concern", "misc"],
	["Festschrift", "misc"],
	["Government Publication", "misc"],
	["Guideline", "misc"],
	["Historical Article", "article"],
	["Interactive Tutorial", "misc"],
	["Interview", "misc"],
	["Introductory Journal Article", "article"],
	["Journal Article", "article"],
	["Legal Case", "misc"],
	["Legislation", "misc"],
	["Letter", "misc"],
	["Meta-Analysis", "misc"],
	["Multicenter Study", "misc"],
	["News", "misc"],
	["Newspaper Article", "article"],
	["Observational Study", "misc"],
	["Observational Study, Veterinary", "misc"],
	["Overall", "misc"],
	["Patient Education Handout", "misc"],
	["Periodical Index", "misc"],
	["Personal Narrative", "misc"],
	["Pictorial Work", "misc"],
	["Popular Work", "misc"],
	["Portrait", "misc"],
	["Practice Guideline", "misc"],
	["Pragmatic Clinical Trial", "misc"],
	["Preprint", "misc"],
	["Publication Components", "misc"],
	["Publication Formats", "misc"],
	["Publication Type Category", "misc"],
	["Published Erratum", "misc"],
	["Randomized Controlled Trial", "misc"],
	["Randomized Controlled Trial, Veterinary", "misc"],
	["Research Support, American Recovery and Reinvestment Act", "misc"],
	["Research Support, N.I.H., Extramural", "misc"],
	["Research Support, N.I.H., Intramural", "misc"],
	["Research Support, Non-U.S. Gov't", "misc"],
	["Research Support, U.S. Gov't, Non-P.H.S.", "misc"],
	["Research Support, U.S. Gov't, P.H.S.", "misc"],
	["Retracted Publication", "misc"],
	["Retraction of Publication", "misc"],
	["Scientific Integrity Review", "misc"],
	["Study Characteristics", "misc"],
	["Support of Research", "misc"],
	["Systematic Review", "misc"],
	["Technical Report", "techreport"],
	["Twin Study", "misc"],
	["Validation Study", "misc"],
	["Video Audio Media", "video"],
	["Webcasts", "misc"],
	["Book", "book"],
	["Book chapter", "inbook"],
	["Conference paper", "inproceedings"],
	["Conference abstract", "inproceedings"],
	["Conference poster", "inproceedings"],
	["Journal article", "article"],
	["Preprint", "misc"],
	["Book review", "misc"],
	["Journal issue or edition", "article"],
	["Review", "techreport"],
	["Dictionary entry", "misc"],
	["Magazine article", "misc"],
	["Sound", "audio"],
	["Dataset", "misc"],
	["Software", "software"],
	["Invention", "misc"],
	["License", "misc"],
	["Patent", "patent"],
	["Registered copyright", "misc"],
	["Standards or policy", "misc"],
	["Trademark", "misc"],
	["Other legal or IP output", "misc"],
]);

/** The BibTeX entry type for a document type. */
export function bibtexType(resultType: string): string {
	return Object.hasOwn(ENTRY_TYPES, resultType) ? ENTRY_TYPES[resultType] : "article";
}

/** Fields named after published_in for each entry type. */
const PUBLISHED_IN: Record<string, string> = {
	article: "journal",
	book: "publisher",
	inbook: "publisher",
	inproceedings: "booktitle",
	phdthesis: "school",
	mastersthesis: "school",
	conference: "booktitle",
	video: "publisher",
	software: "publisher",
	thesis: "school",
};

function dateFields(year: string): Record<string, string> {
	const m = /^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/.exec(year);
	if (!m) return { year: "" };
	const fields: Record<string, string> = { year: m[1] };
	if (m[2]) fields.month = String(Number(m[2]));
	if (m[3]) fields.day = String(Number(m[3]));
	return fields;
}

const text = (v: unknown) => (typeof v === "string" ? v : "");

/** The paper as a BibTeX entry. */
export function paperBibtex(paper: Paper): string {
	const types = paper.resultType.map(bibtexType);
	let type = types.find((t) => t !== "misc") ?? "misc";
	const publishedIn = text(paper.raw.published_in);
	const fields: Record<string, string> = {
		title: paper.title,
		author: paper.authors.map((a) => (a.firstName ? `${a.lastName}, ${a.firstName}` : a.lastName)).join(" and "),
		...dateFields(paper.year),
	};
	const doi = paper.doi.replace(/https:\/\/|http:\/\/|dx\.doi\.org\/|doi\.org\//g, "");
	if (doi) fields.doi = doi;
	if (paper.listLink?.address) fields.url = paper.listLink.address;
	if (type === "misc" && publishedIn) type = "article";
	if (PUBLISHED_IN[type] && (publishedIn || type !== "article")) fields[PUBLISHED_IN[type]] = publishedIn;

	const body = Object.keys(fields)
		.sort()
		.map((k) => ` ${k} = {${fields[k]}}`)
		.join(",\n");
	return `@${type}{${paper.id},\n${body}\n}\n`;
}

/** A file name for the paper's .bib download. */
export function bibtexFileName(paper: Paper): string {
	return `${paper.id.replace(/[^\w.-]+/g, "_") || "export"}.bib`;
}
