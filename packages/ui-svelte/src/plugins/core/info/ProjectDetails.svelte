<!-- @component An OpenAIRE project's details (from the map's search parameters), as text. -->
<script lang="ts">
	import { contextParams } from "@okmaps/core";
	import type { MapState } from "../../../data/state.svelte";

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
