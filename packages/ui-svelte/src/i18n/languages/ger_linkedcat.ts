import type { Strings } from "../strings";
import { ger } from "./ger";

/** German, for LinkedCat (scanned texts): the old map's "ger_linkedcat" strings, over ger. */
export const gerLinkedcat: Strings = {
	...ger,
	year: "Jahr",
	authors: "Autor",
	title: "Titel",
	default_title: 'Knowledge Map für <span id="num_articles"></span> Artikel',
	overview_label: "Knowledge Map für",
	streamgraph_label: "Streamgraph für",
	overview_authors_label: "Knowledge Map für die Werke von",
	streamgraph_authors_label: "Streamgraph für die Werke von",
	articles_label: "open access Dokumente",
	documenttypes_label: "Dokumentarten",
	bio_link: "Biografie",
	area: "Bereich",
	items: "Dokumente",
	backlink: "← Zurück zum Überblick",
	backlink_list: "Zeige alle Dokumente des Bereichs",
	backlink_list_streamgraph: "Zeige alle Dokumente an",
	backlink_list_streamgraph_stream_selected: "Zeige alle Dokumente des Streams an",
	basic_classification: "Basisklassifikation",
	relevance: "Relevanz",
	pdf_load_text:
		"Dieser Vorgang kann mehrere Minuten dauern, da die gescannten Texte sehr umfangreich sein können. Bitte haben Sie etwas Geduld.",
};
