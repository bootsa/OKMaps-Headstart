<!-- @component Info page of a VIPER (Visual Project Explorer) map. -->
<script lang="ts">
	import type { MapState } from "../../../data/state.svelte";
	import ProjectDetails from "../../core/info/ProjectDetails.svelte";

	let { state: map }: { state: MapState } = $props();
</script>

<p>
	VIPER, the Visual Project Explorer, is a unique open science application developed by
	<a href="https://openknowledgemaps.org" target="_blank" rel="noreferrer">Open Knowledge Maps</a>
	that focuses on the discovery of research project results. VIPER enables you to systematically explore a project's
	output and to understand its impact in different areas.
</p>
<h3>Acknowledgements</h3>
<p>
	VIPER is made possible thanks to funding received from
	<a href="https://openaire.eu" target="_blank" rel="noreferrer">OpenAIRE</a>, a key infrastructure that enables the
	European transition to open science. We would also like to thank our data providers
	<a href="https://openaire.eu" target="_blank" rel="noreferrer">OpenAIRE</a>
	(all metadata), <a href="https://crossref.org" target="_blank" rel="noreferrer">CrossRef</a>
	(all citation data), and <a href="https://altmetric.com" target="_blank" rel="noreferrer">Altmetric</a>
	(all other metrics data).
</p>
<h3>Note on the use of metrics</h3>
<p>
	Metrics are provided for indicative purposes only and cannot be used as-is in an evaluation. If you intend to use the
	metrics provided for evaluative purposes, consider relevant guidelines such as the
	<a href="http://www.leidenmanifesto.org/" target="_blank" rel="noreferrer">Leiden Manifesto for Research Metrics</a>.
</p>
<h3>Project Details</h3>
<ProjectDetails state={map} />
