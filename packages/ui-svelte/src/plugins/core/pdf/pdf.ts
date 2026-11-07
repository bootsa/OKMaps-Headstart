/** Which papers get a "PDF" or "File" button, and where their PDF is (old usePdfLookup.ts). */
import type { MapState } from "../../../data/state.svelte";
import type { Paper } from "../../../data/types";

const NON_TEXT = [
	"dataset",
	"musical notation",
	"map",
	"audio",
	"image/video",
	"still image",
	"moving image/video",
	"software",
];
const UNKNOWN = "other/unknown material";

/** Data, media, software, or only "Other/Unknown material": not a text to preview. */
export function isNonText(paper: Paper): boolean {
	const types = paper.resultType.map((t) => t.toLowerCase());
	const known = types.filter((t) => t !== UNKNOWN);
	if (known.length === types.length) return types.some((t) => NON_TEXT.includes(t));
	return known.length === 0 || NON_TEXT.includes(known[0]);
}

/** Open access text with a link: the "PDF" button. */
export function hasPdf(paper: Paper): boolean {
	return (
		paper.oa &&
		!isNonText(paper) &&
		!paper.resultType.includes("dataset") &&
		typeof paper.raw.link === "string" &&
		paper.raw.link !== ""
	);
}

/** Open access file that isn't text: the "File" link. */
export function hasFile(paper: Paper): boolean {
	return paper.oa && isNonText(paper) && !!paper.listLink?.address;
}

/** Where to read the paper when there is no preview. */
export function fallbackUrl(map: MapState, paper: Paper): string {
	return map.config.service === "openaire" && typeof paper.raw.link === "string" ? paper.raw.link : paper.outlink;
}

/**
 * Finds a paper's PDF. The old map asked its server, which searched the
 * landing pages and cached the file; without one, only links that already
 * point at a PDF (PMC, or a .pdf URL) are previewed.
 */
export type PdfResolver = (map: MapState, paper: Paper) => Promise<string | null> | string | null;

export const directPdf: PdfResolver = (map, paper) => {
	if (map.config.service === "pubmed") return paper.oaLink || null;
	const candidates = [paper.oaLink, paper.raw.fulltext].filter((u): u is string => typeof u === "string");
	return candidates.find((u) => /^https?:\/\/\S+\.pdf(?:[?#]\S*)?$/i.test(u)) ?? null;
};

/** What the PDF modal is opened with. */
export interface PdfRequest {
	paper: Paper;
	resolve: PdfResolver;
	viewer?: (url: string) => string;
}
