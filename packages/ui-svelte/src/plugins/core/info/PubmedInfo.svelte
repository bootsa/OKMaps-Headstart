<!-- @component Info page of a PubMed knowledge map. -->
<script lang="ts">
	import type { MapState } from "../../../data/state.svelte";
	import DataSourceInfo from "./DataSourceInfo.svelte";
	import KnowledgeMapInfo from "./KnowledgeMapInfo.svelte";

	let { state: map }: { state: MapState } = $props();
</script>

<KnowledgeMapInfo state={map}>
	{#snippet source()}
		<DataSourceInfo source="PubMed">
			PubMed comprises more than 38 million citations for biomedical literature from MEDLINE, life science journals, and
			online books. For more information please
			<a href="http://www.ncbi.nlm.nih.gov/pubmed" target="_blank" rel="noreferrer">visit the PubMed website</a>.
			Citations are available for resources with a DOI and based on citation data provided by
			<a href="https://www.crossref.org/" target="_blank" rel="noreferrer">Crossref</a>. Results may be impacted by
			accuracy and completeness of this data.
		</DataSourceInfo>
	{/snippet}
</KnowledgeMapInfo>
