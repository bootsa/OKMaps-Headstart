<!--
  @component
  Info page of a map curated in a Google Sheet: who curates it, for which
  project, and the sheet it is made from. All from the map's parameters,
  shown as text; only web and mail addresses become links.
-->
<script lang="ts">
	import { contextParams } from "@okmaps/core";
	import type { MapState } from "../../../data/state.svelte";
	import AboutSoftware from "../../core/info/AboutSoftware.svelte";

	let { state: map }: { state: MapState } = $props();

	const p = $derived(contextParams(map.map.context) ?? {});
	const text = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : "");
	const email = $derived(/^[^\s@<>"]+@[^\s@<>"]+$/.test(text(p.main_curator_email)) ? text(p.main_curator_email) : "");
	const website = $derived(/^https?:\/\//i.test(text(p.project_website)) ? text(p.project_website) : "");
	const sheet = $derived(
		text(p.sheet_id) ? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(text(p.sheet_id))}/edit#gid=0` : "",
	);
</script>

<p>
	Knowledge maps provide an instant overview of a topic by showing the main areas at a glance and resources related to
	each area. This makes it possible to easily identify useful, pertinent information.
</p>
<p>
	Research areas are displayed as bubbles. By clicking on one of the bubbles, you can inspect the resources assigned to
	it. The size of the bubbles is relative to the number of resources assigned to it. Closeness of bubbles implies
	subject similarity. The closer two bubbles, the closer they are subject-wise. Centrality of bubbles implies subject
	similarity with the rest of the map, not importance. The closer a bubble is to the center, the closer it is
	subject-wise to all the other bubbles in the map.
</p>
<h3>Content</h3>
<p>
	The content of this knowledge map is curated by
	{#if email}
		<a href="mailto:{email}">{text(p.main_curator_name) || email}</a>
	{:else}
		{text(p.main_curator_name) || "its curators"}
	{/if}
	{#if text(p.project_name)}
		as part of
		{#if website}
			<a href={website} target="_blank" rel="noreferrer">{text(p.project_name)}</a>
		{:else}
			{text(p.project_name)}
		{/if}
	{/if}
	. Resources are collected and annotated in
	{#if sheet}
		<a href={sheet} target="_blank" rel="noreferrer">a spreadsheet</a>,
	{:else}
		a spreadsheet,
	{/if}
	which is then transformed into the knowledge map.
</p>
<h3>Rights</h3>
<p>
	The curator(s) are solely responsible for the content of the knowledge map. Unless otherwise noted, all content is
	licensed under a
	<a href="http://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer"
		>Creative Commons Attribution 4.0 International License</a
	>. The spreadsheet is made available under
	<a href="https://creativecommons.org/share-your-work/public-domain/cc0/" target="_blank" rel="noreferrer"
		>CC0 (Public Domain Dedication)</a
	>. The knowledge mapping software is open source and hosted on
	<a href="https://github.com/OpenKnowledgeMaps/Headstart" target="_blank" rel="noreferrer">Github</a>.
</p>
<AboutSoftware />
