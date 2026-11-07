<!--
  @component
  The info page for the map's view: the streamgraph page for streamgraphs,
  the knowledge map page otherwise, with the data source part given.
-->
<script lang="ts">
	import type { Snippet } from "svelte";
	import type { MapState } from "../../../data/state.svelte";
	import KnowledgeMapInfo from "./KnowledgeMapInfo.svelte";
	import StreamgraphInfo from "./StreamgraphInfo.svelte";

	let { state: map, source }: { state: MapState; source?: Snippet } = $props();
</script>

{#if map.config.visType === "timeline"}
	<StreamgraphInfo state={map} {source} />
{:else}
	<KnowledgeMapInfo state={map} {source} />
{/if}
