import type { OkmPlugin } from "../../index";
import PdfModal from "./PdfModal.svelte";
import { directPdf, hasFile, hasPdf, type PdfRequest, type PdfResolver } from "./pdf";

export interface PdfOptions {
	/**
	 * Finds the paper's PDF. By default only links that already point at one
	 * count, and other papers get no "PDF" button.
	 */
	resolve?: PdfResolver;
	/** Wraps the PDF's address, e.g. in a PDF.js viewer page. */
	viewer?: (url: string) => string;
}

/**
 * "PDF" under open access texts (a preview of the PDF), and "File" under open
 * access data and media (a link). A server that finds PDFs can pass its own
 * `resolve`.
 */
export function pdfPlugin(options: PdfOptions = {}): OkmPlugin {
	const resolve = options.resolve ?? directPdf;
	return {
		id: "pdf",
		paperActions: [
			{
				id: "pdf",
				label: "PDF",
				title: "Open the PDF",
				primary: true,
				// Without a resolver of its own, only papers that link straight to a PDF.
				show: (map, paper) => hasPdf(paper) && (!!options.resolve || directPdf(map, paper) !== null),
				run: (map, paper) => map.openModal("pdf", { paper, resolve, viewer: options.viewer } satisfies PdfRequest),
			},
			{
				id: "file",
				label: "File",
				title: "Open the file",
				primary: true,
				show: (_map, paper) => hasFile(paper),
				href: (_map, paper) => paper.listLink?.address ?? "",
			},
		],
		modals: { pdf: { title: (_map, data) => (data as PdfRequest).paper.title || "PDF", component: PdfModal } },
	};
}
