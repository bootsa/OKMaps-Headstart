<!-- @component Info page of a BASE knowledge map. -->
<script lang="ts">
	import logo from "../../../assets/base_logo.png";
	import type { MapState } from "../../../data/state.svelte";
	import { contextParams } from "../../../header/context";
	import DataSourceInfo from "./DataSourceInfo.svelte";
	import KnowledgeMapInfo from "./KnowledgeMapInfo.svelte";

	let { state: map }: { state: MapState } = $props();
	const provider = $derived(contextParams(map.map.context)?.repo_name);
</script>

<KnowledgeMapInfo state={map}>
	{#snippet source()}
		<DataSourceInfo
			source="BASE"
			contentProvider={typeof provider === "string" ? provider : null}
			logo={{ src: logo, href: "http://base-search.net", alt: "BASE service logo" }}
		>
			BASE provides access to over 400 million resources from more than 10,000 content sources in all disciplines. For
			more information please
			<a href="http://base-search.net" target="_blank" rel="noreferrer">visit the BASE website</a>.
		</DataSourceInfo>
	{/snippet}
</KnowledgeMapInfo>
