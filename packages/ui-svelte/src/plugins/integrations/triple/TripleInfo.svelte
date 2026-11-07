<!-- @component Info page of a GoTriple knowledge map. -->
<script lang="ts">
	import type { MapState } from "../../../data/state.svelte";
	import DataSourceInfo from "../../core/info/DataSourceInfo.svelte";
	import KnowledgeMapInfo from "../../core/info/KnowledgeMapInfo.svelte";

	let { state: map }: { state: MapState } = $props();
</script>

<KnowledgeMapInfo state={map}>
	{#snippet source()}
		<DataSourceInfo source="GoTriple" />
	{/snippet}
</KnowledgeMapInfo>
