/**
 * The interface state that the old Redux store held (zoom, selected paper,
 * list search, filter and sort), as one class with Svelte 5 runes. Views
 * read its fields directly and call its methods; there are no actions or
 * reducers.
 */

import { type Strings, strings } from "../i18n/strings";
import { getView } from "../views/registry";
import type { MapView } from "../views/types";
import { type MapConfig, mapConfig, type Service } from "./config";
import { listPapers, searchWords } from "./filter";
import { queryTerms } from "./highlight";
import { processMap, resizeMap } from "./process";
import type { Area, MapRecord, Paper, ProcessedMap } from "./types";

export class MapState {
	/** The map's settings; scale() changes what the papers are sized by. */
	config: MapConfig = $state.raw({} as MapConfig);
	readonly strings: Strings;
	/** The researcher of an author map (record.author), else empty. */
	readonly author: Record<string, unknown>;
	map: ProcessedMap = $state.raw({
		context: {},
		papers: [],
		areas: [],
		streams: [],
		size: 0,
	});

	/** uri of the area zoomed into, or null for the overview. */
	zoomedArea: string | null = $state(null);
	/** safeId of the selected paper. */
	selectedPaper: string | null = $state(null);
	/** Keyword of the selected stream (streamgraph). */
	selectedStream: string | null = $state(null);
	/** safeId of the paper under the pointer in the list (geo maps light up its pin). */
	hoveredPaper: string | null = $state(null);
	/** uri of the area under the pointer. */
	hoveredArea: string | null = $state(null);
	search = $state("");
	filter = $state("all");
	sort: string = $state("");
	listVisible = $state(true);
	/** The list fits the screen and scrolls inside (true), or runs its full height and the page scrolls. */
	listFit = $state(true);
	/** The map theme's id (views/knowledge-map/themes). */
	theme: string = $state("labels");
	/** The open modal (see plugins): its id and what it was opened with. */
	modal: { id: string; data?: unknown } | null = $state(null);

	openModal(id: string, data?: unknown) {
		this.modal = { id, data };
	}

	closeModal() {
		this.modal = null;
	}

	/** `config` overrides the service's settings, e.g. { visType: "geomap" }. */
	constructor(record: MapRecord, size: number, config?: Partial<MapConfig>) {
		this.#record = record;
		this.config = mapConfig((record.context.service as Service) ?? "base", config);
		this.strings = strings(this.config.language);
		this.author = record.author && typeof record.author === "object" ? record.author : {};
		this.sort = this.config.sortOptions[0];
		this.map = this.#process(size);
		this.queryWords = this.config.highlightQueryTerms ? queryTerms(record.context.query) : [];
	}

	readonly #record: MapRecord;

	#process(size: number): ProcessedMap {
		const map = processMap(this.#record, size, { config: this.config, strings: this.strings });
		this.view.layout?.(map, this.config);
		return map;
	}

	/** The view that draws this map (config.visType; see ../views). */
	get view(): MapView {
		return getView(this.config.visType);
	}

	/** The "Scale map by" choice in effect (old toolbar scaleValue). */
	get scaleBy(): string | null {
		return this.config.scaleBy ?? this.config.scaleOptions[0] ?? null;
	}

	/**
	 * Sizes the papers by another metric ("content_based" for equal sizes)
	 * and lays the map out again, back at the overview (old rescaleMap).
	 */
	scale(scaleBy: string) {
		if (scaleBy === this.scaleBy) return;
		this.config = { ...this.config, scaleBy, contentBased: scaleBy === "content_based", dynamicSizing: false };
		this.zoomedArea = null;
		this.selectedPaper = null;
		this.map = this.#process(this.map.size);
	}

	/** Words of the search query, highlighted when the list search is empty. */
	readonly queryWords: string[];

	/** Words of the list search, highlighted on the map and in the list. */
	readonly searchWords: string[] = $derived(searchWords(this.search));

	/** The area zoomed into. */
	get area(): Area | undefined {
		return this.zoomedArea === null ? undefined : this.map.areas.find((a) => a.uri === this.zoomedArea);
	}

	/** The selected paper. */
	get paper(): Paper | undefined {
		return this.selectedPaper === null ? undefined : this.map.papers.find((p) => p.safeId === this.selectedPaper);
	}

	/** The papers the list shows, in order. */
	readonly listed: Paper[] = $derived(
		listPapers(this.map.papers, {
			search: this.search,
			filter: this.filter,
			sort: this.sort,
			area: this.zoomedArea,
			paper: this.selectedPaper,
			ids: this.map.streams.find((st) => st.key === this.selectedStream)?.docIds ?? null,
		}),
	);

	/** Papers that match the search and filter (dimmed otherwise on the map). */
	readonly matching: Set<string> = $derived(
		new Set(
			listPapers(this.map.papers, {
				search: this.search,
				filter: this.filter,
				sort: "",
			}).map((p) => p.safeId),
		),
	);

	zoomIn(uri: string) {
		this.zoomedArea = uri;
		this.selectedPaper = null;
	}

	zoomOut() {
		this.zoomedArea = null;
		this.selectedPaper = null;
	}

	/** Selects a paper and, in views with areas (the knowledge map), zooms into its area. */
	selectPaper(safeId: string) {
		const paper = this.map.papers.find((p) => p.safeId === safeId);
		if (!paper) return;
		if (this.view.zoomsToArea) this.zoomedArea = paper.areaUri;
		this.selectedPaper = safeId;
	}

	/** Selects a stream (null for none); the list shows its papers. */
	selectStream(key: string | null) {
		this.selectedStream = key;
		this.selectedPaper = null;
	}

	deselectPaper() {
		this.selectedPaper = null;
	}

	resize(size: number) {
		if (size > 0 && size !== this.map.size) this.map = { ...resizeMap(this.map, size) };
	}
}
