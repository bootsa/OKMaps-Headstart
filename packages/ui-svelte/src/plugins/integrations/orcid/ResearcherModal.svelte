<!--
  @component
  The researcher's ORCID profile: biography, employment, services,
  education, funding, links and awards. Each section shows its first entry
  and opens the rest on "Show more". All text; only web links are links.
-->
<script lang="ts">
	import { SvelteSet } from "svelte/reactivity";
	import { t } from "../../../i18n/strings";
	import type { ModalProps } from "../../index";
	import { researcherSections, text } from "./researcher";

	let { state: map }: ModalProps = $props();

	const s = $derived(map.strings);
	const biography = $derived(text(map.author.biography));
	const sections = $derived(researcherSections(map.author));
	const open = new SvelteSet<string>();
	const toggle = (id: string) => (open.has(id) ? open.delete(id) : open.add(id));
	const LONG_BIO = 160;
</script>

{#snippet more(id: string)}
	<button type="button" class="more" aria-expanded={open.has(id)} onclick={() => toggle(id)}>
		{open.has(id) ? t(s, "showLess") : t(s, "showMore")}
	</button>
{/snippet}

<section>
	<h3>Biography</h3>
	{#if biography}
		<p class="bio" class:short={!open.has("biography") && biography.length > LONG_BIO}>{biography}</p>
		{#if biography.length > LONG_BIO}
			{@render more("biography")}
		{/if}
	{:else}
		<p>{t(s, "noDataAvailable")}</p>
	{/if}
</section>

{#each sections as section (section.id)}
	{@const count = section.entries.length ? ` (${section.entries.length})` : ""}
	<section data-section={section.id}>
		<h3>{section.title}{section.subtitle ? "" : count}</h3>
		{#if section.subtitle}
			<h4>{section.subtitle}{count}</h4>
		{/if}
		{#each open.has(section.id) ? section.entries : section.entries.slice(0, 1) as entry, i (i)}
			<p>
				{#if entry.href}
					<a href={entry.href} target="_blank" rel="noopener noreferrer">{entry.linkText}</a>
					{#if entry.text}
						<br>
					{/if}
				{/if}
				{entry.text}
			</p>
		{:else}
			<p>{t(s, "noDataAvailable")}</p>
		{/each}
		{#if section.entries.length > 1}
			{@render more(section.id)}
		{/if}
	</section>
{/each}

<style>
	section + section {
		margin-top: var(--space-4);
	}

	h3 {
		margin: 0 0 var(--space-1);
		font-size: var(--font-size-sm);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	h4 {
		margin: 0 0 var(--space-1);
		font-size: var(--font-size-sm);
	}

	p {
		margin: 0 0 var(--space-2);
		white-space: pre-line;
		overflow-wrap: anywhere;
	}

	a {
		color: var(--color-link);
	}

	.bio.short {
		display: -webkit-box;
		overflow: hidden;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
	}

	.more {
		padding: 0;
		border: 0;
		background: none;
		color: var(--color-link);
		font: inherit;
		text-decoration: underline;
		cursor: pointer;
	}
</style>
