<!-- @component Info page of an OpenAIRE project map: the project's details. -->
<script lang="ts">
	import type { MapState } from "../../../data/state.svelte";
	import { contextParams } from "../../../header/context";
	import AboutSoftware from "./AboutSoftware.svelte";
	import DataSourceInfo from "./DataSourceInfo.svelte";

	let { state: map }: { state: MapState } = $props();

	const p = $derived(contextParams(map.map.context) ?? {});
	const text = (v: unknown) => (v === undefined || v === null ? "" : String(v));
	const organisations = $derived(
		Array.isArray(p.organisations)
			? (p.organisations as Array<{ name?: unknown; url?: unknown }>).map((o) => ({
					name: text(o.name),
					url: safeUrl(text(o.url)),
				}))
			: [],
	);
	const rows = $derived([
		["Title", p.title],
		["Acronym", p.acronym],
		["Funder", p.funder],
		["Funding program", p.funding_tree],
		["Call", p.call_id],
		["Contract (GA) number", p.project_id],
		["Start Date", p.start_date],
		["End Date", p.end_date],
		["Open Access mandate", p.oa_mandate],
	]);

	/** Only web links: a crafted map must not plant a javascript: URL. */
	function safeUrl(url: string): string | null {
		return /^https?:\/\//i.test(url) ? url : null;
	}
</script>

<p>This knowledge map presents you with a topical overview of research conducted in the following project:</p>
<h3>Project Details</h3>
<table>
	<tbody>
		{#each rows as [label, value] (label)}
			<tr>
				<th scope="row">{label}</th>
				<td>{text(value)}</td>
			</tr>
		{/each}
		<tr>
			<th scope="row">Organizations</th>
			<td>
				{#each organisations as org, i (i)}
					{i ? ", " : ""}
					{#if org.url}
						<a href={org.url} target="_blank" rel="noreferrer">{org.name}</a>
					{:else}
						{org.name}
					{/if}
				{/each}
			</td>
		</tr>
		<tr>
			<th scope="row">OpenAire Link</th>
			<td>
				<a
					href="https://www.openaire.eu/search/project?projectId={encodeURIComponent(text(p.obj_id))}"
					target="_blank"
					rel="noreferrer"
					>Link</a
				>
			</td>
		</tr>
	</tbody>
</table>
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

<style>
	table {
		width: 100%;
		margin-bottom: var(--space-4);
		border-collapse: collapse;
	}

	th,
	td {
		padding: var(--space-1) var(--space-2);
		border-top: 1px solid var(--color-border);
		text-align: left;
		vertical-align: top;
	}

	th {
		width: 40%;
	}
</style>
