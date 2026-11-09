<!--
  @component
  The info page of a knowledge map (old StandardKMInfo): what the map shows,
  how it was made, where the data comes from and the software behind it.
-->
<script lang="ts">
	import { contextParams } from "@okmaps/core";
	import type { Snippet } from "svelte";
	import type { MapState } from "../../data/state.svelte";
	import AboutSoftware from "../../plugins/core/info/AboutSoftware.svelte";

	interface Props {
		state: MapState;
		/** The data source part (DataSourceInfo), if any. */
		source?: Snippet;
	}

	let { state: map, source }: Props = $props();

	const FIELDS: Record<string, string> = {
		relation: "relation",
		identifier: "identifier",
		title: "title",
		paper_abstract: "description",
		published_in: "publisher",
		year: "date",
		authors: "creator",
		link: "link",
		oa_state: "open access",
		resulttype: "type",
		language: "language",
		content_provider: "provider",
		coverage: "coverage",
	};

	const params = $derived(contextParams(map.map.context) ?? {});
	const query = $derived(
		[map.map.context.query, map.map.context.q_advanced].filter((q) => typeof q === "string" && q).join(" "),
	);
	const customTitle = $derived(
		map.config.customTitle ?? (typeof map.map.context.custom_title === "string" ? map.map.context.custom_title : null),
	);
	const clustering = $derived(typeof params.custom_clustering === "string" ? params.custom_clustering : null);
</script>

{#if customTitle || query}
	<p>
		This knowledge map presents you with {clustering ? "an overview" : "a topical overview"} of research on
		<strong>{customTitle ?? query}</strong>
		based on the 100
		{#if params.sorting === "most-relevant"}
			<a target="_blank" rel="noreferrer" href="https://openknowledgemaps.org/faq#faq-most-relevant">most relevant</a>
		{:else}
			most recent
		{/if}
		resources matching your search query.
		{#if clustering}
			The knowledge map is clustered by {clustering}.
		{/if}
	</p>
{:else}
	<p>This knowledge map presents you with a topical overview of research based on 100 resources.</p>
{/if}
{#if query && customTitle}
	<p>This visualization has a custom title and was created using the following query: <strong>{query}</strong></p>
{/if}
{#if !clustering}
	<p>
		We use text similarity to create a knowledge map. The algorithm groups those resources together that have many words
		in common. Area titles are created from subject keywords of resources that have been assigned to the same area. We
		select those keywords and phrases that appear frequently in one area, and seldom in other areas.
	</p>
{/if}
<p>
	Knowledge maps provide an instant overview of a topic by showing the main areas at a glance, and resources related to
	them. This makes it possible to easily identify useful, pertinent information.
	{#if clustering}
		Find out more about knowledge maps in our
		<a target="_blank" rel="noreferrer" href="https://openknowledgemaps.org/faq">FAQs</a>.
	{/if}
</p>
{#if clustering}
	<p>
		<strong>Please note:</strong>
		For this knowledge map we do not use topical clustering as described in our FAQs. In this knowledge map we use the
		keywords available in the {FIELDS[clustering] ?? "subject"} metadata field for the creation of the area titles.
	</p>
{:else}
	<p>
		Please <a target="_blank" rel="noreferrer" href="https://openknowledgemaps.org/faq">read our FAQs</a> to find out
		more about knowledge maps.
	</p>
{/if}
{@render source?.()}
<AboutSoftware />
