<!--
  @component
  The info page for the map's view (the view's `info` part: knowledge map,
  streamgraph, geo map, ...), with the data source part given (geo maps
  show none, as before).
-->
<script lang="ts">
	import type { Snippet } from "svelte";
	import type { MapState } from "../../../data/state.svelte";

	let { state: map, source }: { state: MapState; source?: Snippet } = $props();

	const Info = $derived(map.view.info);
</script>

{#if Info}
	<Info state={map} {source} />
{/if}
