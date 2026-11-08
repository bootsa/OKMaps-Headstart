<script module lang="ts">
	import type { MapRecord } from "@okmaps/core";
	import { registerLanguages } from "@okmaps/core";
	import { defineMeta } from "@storybook/addon-svelte-csf";
	import aquanavi from "../test/fixtures/aquanavi-geomap.json";
	import base from "../test/fixtures/base-map.json";
	import { MapState } from "./data/state.svelte";
	import { registerPlugin } from "./plugins";
	import { creditPlugin, registerCorePlugins } from "./plugins/core";
	import { orcidPlugin } from "./plugins/integrations";
	import Visualization from "./Visualization.svelte";

	const { Story } = defineMeta({
		title: "Views/Visualization",
		component: Visualization,
		parameters: { layout: "fullscreen" },
	});

	// Built here, not passed as an arg: Storybook copies args, and a copy of
	// the state no longer updates the page.
	registerCorePlugins();
	registerLanguages();
	registerPlugin(orcidPlugin());
	registerPlugin(creditPlugin({ faqs: "https://openknowledgemaps.org/faq", create: "https://openknowledgemaps.org/" }));
	const record = base as unknown as MapRecord;
	const state = new MapState(
		{
			...record,
			context: {
				...record.context,
				params: { from: "2000-01-01", to: "2026-11-07", sorting: "most-relevant", document_types: ["121", "F"] },
			},
		},
		600,
	);

	const orcid = new MapState(
		{
			...record,
			documents: record.documents.map((d, i) => ({
				...d,
				citation_count: i * 3,
				cited_by_tweeters_count: i % 4 ? i : undefined,
				cited_by_wikipedia_count: i % 5 ? undefined : 1,
			})),
			author: {
				author_name: "Ada Lovelace",
				orcid_id: "0000-0002-1825-0097",
				biography: "Mathematician and writer, known for her work on the Analytical Engine.",
				employment: {
					role: "Senior research software engineer",
					organization: "Leibniz Institute of Freshwater Ecology",
				},
				employments: [
					{ role: "Engineer", organization: "IGB", start_date: "2019" },
					{ role: "Student", organization: "FU Berlin", start_date: "2014", end_date: "2018" },
				],
				researcher_urls: [{ url: "https://example.org/", url_name: "Homepage" }],
				normalized_h_index: 1.3,
				academic_age: 7,
				total_citations: 120,
			},
			context: { ...record.context, service: "orcid", query: "0000-0002-1825-0097", params: {} },
		},
		600,
		{
			scaleOptions: ["content_based", "citations", "cited_by_accounts_count", "references"],
			scaleExplanations: {
				content_based: "The size of the bubbles is relative to the number of resources in them.",
				citations: "The size of the bubbles is relative to the number of citations of the resources in them.",
			},
		},
	);

	// Twelve keywords over twenty years, made up for the story.
	const years = Array.from({ length: 20 }, (_, i) => String(2005 + i));
	const keywords = [
		"plankton",
		"salinity",
		"warming",
		"mesocosm",
		"nutrients",
		"fisheries",
		"acidification",
		"biodiversity",
		"sediment",
		"algae",
		"oxygen",
		"microbes",
	];
	const streamgraph = new MapState(
		{
			...record,
			context: { ...record.context, params: { sorting: "most-relevant" } },
			streamgraph: {
				x: years,
				subject: keywords.map((name, k) => ({
					name,
					y: years.map((_, i) => Math.max(0, Math.round(6 + 5 * Math.sin((i + k * 3) / 3) + (k % 4) - i / 8))),
					ids_overall: record.documents.slice(k * 5, k * 5 + 5).map((d) => String(d.id)),
				})),
			},
		},
		600,
		{ visType: "timeline" },
	);

	const geomap = new MapState(aquanavi as unknown as MapRecord, 600, { visType: "geomap" });
</script>

<Story name="Knowledge map with list">
	{#snippet template()}
		<Visualization {state} />
	{/snippet}
</Story>

<Story name="ORCID researcher map">
	{#snippet template()}
		<Visualization state={orcid} />
	{/snippet}
</Story>

<Story name="Streamgraph">
	{#snippet template()}
		<Visualization state={streamgraph} />
	{/snippet}
</Story>

<Story name="Geo map">
	{#snippet template()}
		<Visualization state={geomap} />
	{/snippet}
</Story>
