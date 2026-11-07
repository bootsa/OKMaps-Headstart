<!-- @component Info page of an OpenAIRE project map: the project's details. -->
<script lang="ts">
	import type { MapState } from "../../../data/state.svelte";
	import AboutSoftware from "./AboutSoftware.svelte";
	import DataSourceInfo from "./DataSourceInfo.svelte";
	import ProjectDetails from "./ProjectDetails.svelte";

	let { state: map }: { state: MapState } = $props();
</script>

<p>This knowledge map presents you with a topical overview of research conducted in the following project:</p>
<h3>Project Details</h3>
<ProjectDetails state={map} />
<p>
	We use text similarity to create a knowledge map. The algorithm groups those resources together that have many words
	in common. Area titles are created from subject keywords of resources that have been assigned to the same area. We
	select those keywords and phrases that appear frequently in one area, and seldom in other areas.
</p>
<p>
	Knowledge maps provide an instant overview of a topic by showing the main areas at a glance, and resources related to
	them. This makes it possible to easily identify useful, pertinent information.
</p>
<p>
	Please <a target="_blank" rel="noreferrer" href="https://openknowledgemaps.org/faq">read our FAQs</a> to find out more
	about knowledge maps.
</p>
<DataSourceInfo source="OpenAIRE">
	<a href="https://www.openaire.eu/" target="_blank" rel="noreferrer">OpenAIRE</a>
	is a key infrastructure that enables the European transition to open science. It provides access to 3 million research
	projects and more than 70 million research outputs from more than 100,000 data sources.
</DataSourceInfo>
<AboutSoftware />
