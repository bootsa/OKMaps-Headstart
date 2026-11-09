/**
 * What the interface around one map knows: zoom, selection, the list's
 * search, filter and sort, hover, which parts are open, the open modal.
 * The interface reads its fields and calls its methods; any framework (or
 * none) can follow it through subscribe() (see ./observable.ts).
 */
import { type MapConfig, mapConfig, type Service } from "../data/config";
import { listPapers, searchWords } from "../data/filter";
import { queryTerms } from "../data/highlight";
import { processMap, resizeMap } from "../data/process";
import type { Area, MapRecord, Paper, ProcessedMap } from "../data/types";
import { type Strings, strings } from "../i18n/strings";
import { getViewType } from "../views/registry";
import type { ViewType } from "../views/types";
import { Observable } from "./observable";

export interface MapFields {
	config: MapConfig;
	map: ProcessedMap;
	zoomedArea: string | null;
	selectedPaper: string | null;
	selectedStream: string | null;
	hoveredPaper: string | null;
	hoveredArea: string | null;
	search: string;
	filter: string;
	sort: string;
	listVisible: boolean;
	sectionsOpen: boolean;
	listFit: boolean;
	theme: string;
	modal: { id: string; data?: unknown } | null;
}

export class MapState extends Observable<MapFields> {
	readonly strings: Strings;
	/** The researcher of an author map (record.author), else empty. */
	readonly author: Record<string, unknown>;
	/** Words of the search query, highlighted when the list search is empty. */
	readonly queryWords: string[];
	readonly #record: MapRecord;

	/** `config` overrides the service's settings, e.g. { visType: "geomap" }. */
	constructor(record: MapRecord, size: number, config?: Partial<MapConfig>) {
		const cfg = mapConfig((record.context.service as Service) ?? "base", config);
		super({
			config: cfg,
			map: { context: {}, papers: [], areas: [], streams: [], size: 0 },
			zoomedArea: null,
			selectedPaper: null,
			selectedStream: null,
			hoveredPaper: null,
			hoveredArea: null,
			search: "",
			filter: "all",
			sort: cfg.sortOptions[0],
			listVisible: true,
			sectionsOpen: true,
			listFit: true,
			theme: "labels",
			modal: null,
		});
		this.#record = record;
		this.strings = strings(cfg.language);
		this.author = record.author && typeof record.author === "object" ? record.author : {};
		this.write("map", this.#process(size));
		this.queryWords = cfg.highlightQueryTerms ? queryTerms(record.context.query) : [];
	}

	#process(size: number): ProcessedMap {
		const config = this.peek("config");
		const map = processMap(this.#record, size, { config, strings: this.strings });
		getViewType(config.visType).layout?.(map, config);
		return map;
	}

	/** The map's settings; scale() changes what the papers are sized by. */
	get config(): MapConfig {
		return this.read("config");
	}
	set config(v: MapConfig) {
		this.write("config", v);
	}
	/** The processed map: papers, areas, streams, places. */
	get map(): ProcessedMap {
		return this.read("map");
	}
	set map(v: ProcessedMap) {
		this.write("map", v);
	}
	/** uri of the area zoomed into, or null for the overview. */
	get zoomedArea(): string | null {
		return this.read("zoomedArea");
	}
	set zoomedArea(v: string | null) {
		this.write("zoomedArea", v);
	}
	/** safeId of the selected paper. */
	get selectedPaper(): string | null {
		return this.read("selectedPaper");
	}
	set selectedPaper(v: string | null) {
		this.write("selectedPaper", v);
	}
	/** Keyword of the selected stream (streamgraph). */
	get selectedStream(): string | null {
		return this.read("selectedStream");
	}
	set selectedStream(v: string | null) {
		this.write("selectedStream", v);
	}
	/** safeId of the paper under the pointer in the list (geo maps light up its pin). */
	get hoveredPaper(): string | null {
		return this.read("hoveredPaper");
	}
	set hoveredPaper(v: string | null) {
		this.write("hoveredPaper", v);
	}
	/** uri of the area under the pointer. */
	get hoveredArea(): string | null {
		return this.read("hoveredArea");
	}
	set hoveredArea(v: string | null) {
		this.write("hoveredArea", v);
	}
	/** The list's search words, as typed. */
	get search(): string {
		return this.read("search");
	}
	set search(v: string) {
		this.write("search", v);
	}
	get filter(): string {
		return this.read("filter");
	}
	set filter(v: string) {
		this.write("filter", v);
	}
	get sort(): string {
		return this.read("sort");
	}
	set sort(v: string) {
		this.write("sort", v);
	}
	get listVisible(): boolean {
		return this.read("listVisible");
	}
	set listVisible(v: boolean) {
		this.write("listVisible", v);
	}
	/** The list's shortcuts to the map's areas or streams are shown (they fold away). */
	get sectionsOpen(): boolean {
		return this.read("sectionsOpen");
	}
	set sectionsOpen(v: boolean) {
		this.write("sectionsOpen", v);
	}
	/** The list fits the screen and scrolls inside (true), or runs its full height and the page scrolls. */
	get listFit(): boolean {
		return this.read("listFit");
	}
	set listFit(v: boolean) {
		this.write("listFit", v);
	}
	/** The map theme's id (the knowledge map's themes). */
	get theme(): string {
		return this.read("theme");
	}
	set theme(v: string) {
		this.write("theme", v);
	}
	/** The open modal (see plugins): its id and what it was opened with. */
	get modal(): { id: string; data?: unknown } | null {
		return this.read("modal");
	}
	set modal(v: { id: string; data?: unknown } | null) {
		this.write("modal", v);
	}

	openModal(id: string, data?: unknown) {
		this.modal = { id, data };
	}

	closeModal() {
		this.modal = null;
	}

	/** The view type that draws this map (config.visType). A UI layer narrows it to its own views. */
	get view(): ViewType {
		return getViewType(this.config.visType);
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
		this.map = this.#process(this.peek("map").size);
	}

	/** Words of the list search, highlighted on the map and in the list. */
	get searchWords(): string[] {
		return this.memo("searchWords", ["search"], () => searchWords(this.peek("search")));
	}

	/** The area zoomed into. */
	get area(): Area | undefined {
		const uri = this.zoomedArea;
		return uri === null ? undefined : this.map.areas.find((a) => a.uri === uri);
	}

	/** The selected paper. */
	get paper(): Paper | undefined {
		const id = this.selectedPaper;
		return id === null ? undefined : this.map.papers.find((p) => p.safeId === id);
	}

	/** The papers the list shows, in order. */
	get listed(): Paper[] {
		return this.memo(
			"listed",
			["map", "search", "filter", "sort", "zoomedArea", "selectedPaper", "selectedStream"],
			() => {
				const map = this.peek("map");
				const stream = this.peek("selectedStream");
				return listPapers(map.papers, {
					search: this.peek("search"),
					filter: this.peek("filter"),
					sort: this.peek("sort"),
					area: this.peek("zoomedArea"),
					paper: this.peek("selectedPaper"),
					ids: map.streams.find((st) => st.key === stream)?.docIds ?? null,
				});
			},
		);
	}

	/** Papers that match the search and filter (dimmed otherwise on the map). */
	get matching(): Set<string> {
		return this.memo(
			"matching",
			["map", "search", "filter"],
			() =>
				new Set(
					listPapers(this.peek("map").papers, {
						search: this.peek("search"),
						filter: this.peek("filter"),
						sort: "",
					}).map((p) => p.safeId),
				),
		);
	}

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
		if (this.view.areas) this.zoomedArea = paper.areaUri;
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
		const map = this.peek("map");
		if (size > 0 && size !== map.size) this.map = { ...resizeMap(map, size) };
	}
}
