/**
 * The interface state that the old Redux store held (zoom, selected paper,
 * list search, filter and sort), as one class with Svelte 5 runes. Views
 * read its fields directly and call its methods; there are no actions or
 * reducers.
 */

import { type Strings, strings } from "../i18n/strings";
import { type MapConfig, mapConfig, type Service } from "./config";
import { listPapers } from "./filter";
import { processMap, resizeMap } from "./process";
import type { Area, MapRecord, Paper, ProcessedMap } from "./types";

export class MapState {
	readonly config: MapConfig;
	readonly strings: Strings;
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
	/** uri of the area under the pointer. */
	hoveredArea: string | null = $state(null);
	search = $state("");
	filter = $state("all");
	sort: string = $state("");
	listVisible = $state(true);

	/** `config` overrides the service's settings, e.g. { visType: "geomap" }. */
	constructor(record: MapRecord, size: number, config?: Partial<MapConfig>) {
		this.config = mapConfig((record.context.service as Service) ?? "base", config);
		this.strings = strings(this.config.language);
		this.sort = this.config.sortOptions[0];
		this.map = processMap(record, size, {
			config: this.config,
			strings: this.strings,
		});
	}

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

	/** Selects a paper and zooms into its area. */
	selectPaper(safeId: string) {
		const paper = this.map.papers.find((p) => p.safeId === safeId);
		if (!paper) return;
		this.zoomedArea = paper.areaUri;
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
