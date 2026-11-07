<!--
  @component
  The info page of a streamgraph (old StandardSGInfo): what the streams
  show, how to read their heights, where the data comes from and the
  software behind it.
-->
<script lang="ts">
	import type { Snippet } from "svelte";
	import type { MapState } from "../../../data/state.svelte";
	import { contextParams } from "../../../header/context";
	import AboutSoftware from "./AboutSoftware.svelte";

	interface Props {
		state: MapState;
		/** The data source part (DataSourceInfo), if any. */
		source?: Snippet;
	}

	let { state: map, source }: Props = $props();

	const params = $derived(contextParams(map.map.context) ?? {});
	const query = $derived(
		[map.map.context.query, map.map.context.q_advanced].filter((q) => typeof q === "string" && q).join(" "),
	);
	const customTitle = $derived(
		map.config.customTitle ?? (typeof map.map.context.custom_title === "string" ? map.map.context.custom_title : null),
	);
</script>

<p>
	This streamgraph presents you with an overview of the main keywords
	{#if customTitle || query}
		related to <strong>{customTitle ?? query}</strong>
	{/if}
	over time. It is based on the
	{#if params.sorting === "most-relevant"}
		<a target="_blank" rel="noreferrer" href="https://openknowledgemaps.org/faq#faq-most-relevant">most relevant</a>
	{:else}
		most recent
	{/if}
	resources related to the main keywords. Up to 1000 resources have been taken into consideration for the computation of
	the streamgraph.
</p>
<p>
	The height of a stream represents the number of resources with this keyword at a specific time. It is important to
	note that the number of resources matches the relative height, not the absolute height of the stream.
</p>
{#if query && customTitle}
	<p>This visualization has a custom title and was created using the following query: <strong>{query}</strong></p>
{/if}
<p>
	Streamgraphs are particularly useful for investigating the evolution of keywords over time and to analyse trends in
	research.
</p>
<p>
	Please <a target="_blank" rel="noreferrer" href="https://openknowledgemaps.org/faqs_streamgraph">read our FAQs</a> to
	find out more about streamgraphs.
</p>
{@render source?.()}
<AboutSoftware />
