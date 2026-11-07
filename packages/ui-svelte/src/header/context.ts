/**
 * The map's title and context line (number of resources, time span, data
 * source, ...), worked out from the map's search context and settings as
 * the old reducers/heading.ts, contextLine.ts and timespan.ts did. All of it
 * is plain text.
 */
import type { MapConfig } from "../data/config";
import type { MapContext, Paper } from "../data/types";
import { type Strings, t } from "../i18n/strings";

export type MapTitle =
	| { kind: "basic"; text: string }
	| { kind: "standard"; label: string; text: string; full: string }
	| { kind: "project"; text: string; full: string; projectId: string }
	| { kind: "custom"; label: string; text: string; tooltip: string };

/** One part of the context line; `tooltip` explains it on hover or focus. */
export interface ContextItem {
	id: string;
	text: string;
	tooltip?: string;
	/** Shown as a term with a dotted underline (it has more to say). */
	more?: boolean;
	/** Makes the item a link-style button, e.g. to open a plugin's modal. */
	run?: () => void;
}

type Params = Record<string, unknown>;

/** The search parameters, which a stored map may keep as a JSON string. */
export function contextParams(context: MapContext): Params | null {
	const p = context.params;
	if (typeof p === "string") {
		try {
			const parsed = JSON.parse(p);
			return parsed && typeof parsed === "object" ? parsed : null;
		} catch {
			return null;
		}
	}
	return p && typeof p === "object" ? (p as Params) : null;
}

const str = (v: unknown): string | null => (v === undefined || v === null || v === "null" ? null : String(v));

/** Cuts `text` to `max` characters, ending in "...". */
export function sliceText(text: string, max: number): string {
	return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}

const MAX_LENGTH_VIPER = 47;
const MAX_LENGTH_CUSTOM = 100;

function headingLabel(config: MapConfig, s: Strings): string {
	const key =
		config.visType === "timeline"
			? config.isAuthorview
				? "streamgraph_authors_label"
				: "streamgraph_label"
			: config.visType === "geomap"
				? "geomap_label"
				: config.isAuthorview
					? "overview_authors_label"
					: "overview_label";
	return t(s, key);
}

/** The map's title (old Heading.tsx renderTitle). */
export function mapTitle(config: MapConfig, context: MapContext, s: Strings): MapTitle {
	if (config.presetTitle) return { kind: "basic", text: config.presetTitle };
	if (!config.createTitleFromContext) return { kind: "basic", text: t(s, "default_title_text") };
	const params = contextParams(context) ?? {};
	const label = headingLabel(config, s);
	const query = String(context.query ?? "");
	if (config.titleStyle === "viper") {
		const title = String(params.title ?? query);
		const acronym = str(params.acronym);
		const full = acronym ? `${acronym} - ${title}` : title;
		return {
			kind: "project",
			text: sliceText(full, MAX_LENGTH_VIPER),
			full,
			projectId: String(params.project_id ?? ""),
		};
	}
	const custom = config.customTitle ?? str(context.custom_title) ?? str(params.custom_title);
	if (custom) {
		return {
			kind: "custom",
			label,
			text: sliceText(custom, MAX_LENGTH_CUSTOM),
			tooltip: `${t(s, "custom_title_explanation")} ${query}`,
		};
	}
	return { kind: "standard", label, text: query, full: query };
}

/** How the papers were picked: "most-relevant", "most-recent" or null (old getModifier). */
export function modifier(config: MapConfig, context: MapContext, count: number): string | null {
	if (context.service === "orcid") return "most-recent";
	const sorting = str(contextParams(context)?.sorting);
	if (!sorting) return null;
	if (count < config.maxDocuments && sorting !== "most-relevant") return null;
	return sorting;
}

const SERVICE_START: Record<string, string> = {
	doaj: "1809",
	pubmed: "1809-01-01",
	base: "1665-01-01",
	triple: "1750",
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const yearOnly = (service: string) => service === "doaj" || service === "triple";

/** A date as the old map showed it: "7 Nov 2026" (or "2026"), in UTC. */
function showDate(d: Date, service: string): string {
	if (yearOnly(service)) return String(d.getUTCFullYear());
	return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function isoDate(d: Date, service: string): string {
	if (yearOnly(service)) return String(d.getUTCFullYear());
	return d.toISOString().slice(0, 10);
}

/**
 * The searched time span: "1 Jan 2000 - 7 Nov 2026", or "Until 7 Nov 2026"
 * when the search started at the service's earliest date (old timespan.ts).
 */
export function timespan(config: MapConfig, context: MapContext, now = new Date()): string | null {
	const params = contextParams(context);
	const fromRaw = str(params?.from);
	const toRaw = str(params?.to);
	if (!fromRaw || !toRaw) return null;
	const service = config.service as string;
	const from = new Date(fromRaw);
	let to = /^\d{4}$/.test(toRaw) ? new Date(`${toRaw}-12-31`) : new Date(toRaw);
	if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
	if (to.getTime() > now.getTime()) to = now;
	const until = `Until ${showDate(to, service)}`;
	const mostRecentStreamgraph =
		config.visType === "timeline" && modifier(config, context, Number.POSITIVE_INFINITY) === "most-recent";
	if (mostRecentStreamgraph) return until;
	const start = SERVICE_START[service] ?? "1970-01-01";
	return isoDate(from, service) === start ? until : `${showDate(from, service)} - ${showDate(to, service)}`;
}

const isWebUrl = (v: unknown): v is string => typeof v === "string" && /^https?:\/\//i.test(v);

/**
 * The picture beside the title of an author map (old AuthorImage): the
 * map's image_link, linking to the researcher's ORCID profile if there is
 * one. `src` is null when the map has no picture of its own.
 */
export function authorImage(
	config: MapConfig,
	context: MapContext,
	author: Record<string, unknown>,
): { src: string | null; href: string | null } | null {
	if (!config.isAuthorview) return null;
	const image = contextParams(context)?.image_link;
	const src = isWebUrl(image) ? image : null;
	const orcid = str(author.orcid_id);
	if (context.service === "orcid" && orcid) return { src, href: `https://orcid.org/${encodeURIComponent(orcid)}` };
	return { src, href: src };
}

/** "high", "low" or null: whether papers without an abstract were left out. */
export function metadataQuality(context: MapContext): "high" | "low" | null {
	const raw = contextParams(context)?.min_descsize;
	const min = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
	if (Number.isNaN(min)) return null;
	if (context.service === "base") return min < 300 ? "low" : "high";
	if (context.service === "pubmed" || context.service === "aquanavi") return min === 0 ? "low" : "high";
	return null;
}

/** The context line's items, in the old order. */
export function contextItems(config: MapConfig, context: MapContext, papers: Paper[], s: Strings): ContextItem[] {
	const params = contextParams(context);
	if (!config.showContext || !params) return [];
	const items: ContextItem[] = [];
	const service = String(context.service ?? config.service);
	const isStreamgraph = config.visType === "timeline";

	const living = config.isAuthorview ? str(params.living_dates) : null;
	if (living) items.push({ id: "living_dates", text: living });

	// Number of resources, "100 most relevant resources" for capped searches.
	const count = papers.length;
	const how = modifier(config, context, count);
	const label = t(s, "articles_label");
	const capped = (service === "pubmed" || service === "base") && count >= 100 && !isStreamgraph;
	const shown = capped ? 100 : count;
	const oa = config.showOaNumber ? ` (${papers.filter((p) => p.oa).length} open access)` : "";
	if (how === "most-relevant") {
		items.push({
			id: "num_articles",
			text: `${shown} ${t(s, "most_relevant_label")} ${label}${oa}`,
			tooltip: t(s, isStreamgraph ? "most_relevant_tooltip_sg" : "most_relevant_tooltip"),
		});
	} else if (how === "most-recent") {
		items.push({ id: "num_articles", text: `${shown} ${t(s, "most_recent_label")} ${label}${oa}` });
	} else {
		items.push({ id: "num_articles", text: `${shown} ${label}${oa}` });
	}

	const source = config.showDataSource ? config.serviceNames[service] : undefined;
	if (source) {
		const provider = str(params.repo_name);
		items.push(
			provider
				? {
						id: "source",
						text: `${t(s, "source_label")}: ${sliceText(provider, 6)}`,
						tooltip: `${provider} (via ${source})`,
						more: true,
					}
				: { id: "source", text: `${t(s, "source_label")}: ${source}` },
		);
	}

	const span = timespan(config, context);
	if (span) {
		items.push(
			isStreamgraph
				? { id: "timespan", text: span, tooltip: t(s, "time_frame_context_sg"), more: true }
				: { id: "timespan", text: span },
		);
	}

	const types = documentTypes(config, params);
	if (types.length) {
		items.push({
			id: "document_types",
			text: t(s, "documenttypes_label"),
			tooltip: `${t(s, "documenttypes_tooltip")}\n\n${types.join(", ")}`,
			more: true,
		});
	}

	if (config.titleStyle === "viper") {
		const kinds = (p: Paper, kind: string) => p.resultType.some((r) => r.toLowerCase() === kind);
		items.push({
			id: "paper_count",
			text: `${papers.filter((p) => kinds(p, "publication")).length} ${t(s, "paper_count_label")}`,
		});
		items.push({
			id: "dataset_count",
			text: `${papers.filter((p) => kinds(p, "dataset")).length} ${t(s, "dataset_count_label")}`,
		});
		const funder = str(params.funder);
		if (funder) items.push({ id: "funder", text: `Funder: ${funder}` });
		const start = str(params.start_date);
		const end = str(params.end_date);
		if (start && end) items.push({ id: "project_runtime", text: `${start.slice(0, 4)}–${end.slice(0, 4)}` });
	}

	const language = str(params.language);
	if (language) items.push({ id: "search_lang", text: `Language: ${language}` });

	const stamp = config.showTimestamp ? str(context.last_update) : null;
	if (stamp) items.push({ id: "timestamp", text: `${t(s, "timestamp_label")}: ${stamp}` });

	const quality = metadataQuality(context);
	const desc = quality ? s[`${quality}_metadata_quality_desc_${service}`] : undefined;
	if (quality && typeof desc === "string") {
		items.push({ id: "metadata_quality", text: t(s, `${quality}_metadata_quality`), tooltip: desc, more: true });
	}
	return items;
}

/** Names of the searched document types (BASE codes are named; others as given). */
function documentTypes(config: MapConfig, params: Params): string[] {
	const key = ["document_types", "include_content_type", "article_types"].find((k) => Object.hasOwn(params, k));
	const value = key ? params[key] : null;
	if (!Array.isArray(value)) return [];
	return value.map((v) => config.documentTypeNames[String(v)] ?? String(v));
}
