<!--
  @component
  The info page for the map's view: the geo map, streamgraph or knowledge
  map page, with the data source part given (geo maps show none, as before).
-->
<script lang="ts">
	import type { Snippet } from "svelte";
	import type { MapState } from "../../../data/state.svelte";
	import GeomapInfo from "./GeomapInfo.svelte";
	import KnowledgeMapInfo from "./KnowledgeMapInfo.svelte";
	import StreamgraphInfo from "./StreamgraphInfo.svelte";

	let { state: map, source }: { state: MapState; source?: Snippet } = $props();
</script>

{#if map.config.visType === "geomap"}
	<GeomapInfo state={map} />
{:else if map.config.visType === "timeline"}
	<StreamgraphInfo state={map} {source} />
{:else}
	<KnowledgeMapInfo state={map} {source} />
{/if}
