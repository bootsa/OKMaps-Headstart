<!--
  @component
  Info page of an ORCID researcher map: whose works it shows, and where
  the data and metrics come from.
-->
<script lang="ts">
	import type { MapState } from "../../../data/state.svelte";
	import AboutSoftware from "../../core/info/AboutSoftware.svelte";
	import { text } from "./researcher";

	let { state: map }: { state: MapState } = $props();

	const ctx = $derived(map.map.context);
	const query = $derived([text(ctx.query), text(ctx.q_advanced)].filter(Boolean).join(" "));
	const name = $derived(text(map.author.author_name));
</script>

<p>
	This knowledge map presents you with a topical overview of the most recent works of
	<strong>{name}{query ? ` (${query})` : ""}</strong>.
</p>
<p>
	The knowledge map provides an instant overview of a researcher's works showing their main areas of interest at a
	glance, and resources related to them. This makes it possible to easily identify useful, pertinent information.
</p>
<p>
	We use text similarity to create a knowledge map. The algorithm groups those resources together that have many words
	in common. Area titles are created from subject keywords of resources that have been assigned to the same area. We
	select those keywords and phrases that appear frequently in one area, and seldom in other areas.
</p>
<h3>Data source</h3>
<p>
	We use multiple data sources to generate the content. For the knowledge map and the researcher details we use
	<a href="https://orcid.org/" target="_blank" rel="noreferrer">ORCID</a>
	as our main data source. To improve knowledge map quality we enrich the metadata of works that have a DOI, e.g. we add
	keywords, open access information and abstracts from
	<a href="https://www.base-search.net" target="_blank" rel="noreferrer">BASE</a>.
</p>
<p>
	Metrics are based on data provided by
	<a href="https://www.crossref.org/" target="_blank" rel="noreferrer">Crossref</a>,
	<a href="https://www.altmetric.com/" target="_blank" rel="noreferrer">Altmetric</a>, and the information supplied by
	the researcher on their ORCID profile. Results may be impacted by accuracy and completeness of this data. Please note
	that the data provided by Altmetric ("social media mentions" and "references outside of academia") are protected by
	copyright and other proprietary rights, as outlined in their
	<a href="https://www.altmetric.com/terms-of-use/" target="_blank" rel="noreferrer">Terms of Use</a>.
</p>
<AboutSoftware />
