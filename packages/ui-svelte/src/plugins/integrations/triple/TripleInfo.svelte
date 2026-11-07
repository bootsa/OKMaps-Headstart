<!-- @component Info page of a GoTriple knowledge map or streamgraph. -->
<script lang="ts">
	import type { MapState } from "../../../data/state.svelte";
	import DataSourceInfo from "../../core/info/DataSourceInfo.svelte";
	import MapInfo from "../../core/info/MapInfo.svelte";

	let { state: map }: { state: MapState } = $props();
</script>

<MapInfo state={map}>
	{#snippet source()}
		<DataSourceInfo source="GoTriple" />
	{/snippet}
</MapInfo>
