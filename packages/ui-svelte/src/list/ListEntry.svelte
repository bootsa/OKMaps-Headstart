<!--
  @component
  One paper in the list: access tags, title, authors, journal, link,
  abstract, keywords and its area. Everything from the map is rendered as
  text. The title selects the paper (and zooms to its area on a knowledge
  map); the area name zooms in. Geo maps show the place instead of
  authors and area.
-->
<script lang="ts">
	import Button from "../components/Button.svelte";
	import Highlight from "../components/Highlight.svelte";
	import Tag from "../components/Tag.svelte";
	import { paperDate, scaleUnit } from "../data/papers";
	import type { MapState } from "../data/state.svelte";
	import type { Paper } from "../data/types";
	import { t } from "../i18n/strings";
	import { paperActions, paperMetrics } from "../plugins";
	import { authorsLine, docTypeTags, shortTitle } from "./format";

	interface Props {
		paper: Paper;
		state: MapState;
	}

	let { paper, state: map }: Props = $props();

	const s = $derived(map.strings);
	const selected = $derived(map.selectedPaper === paper.safeId);
	const search = $derived(map.searchWords);
	const query = $derived(map.queryWords);
	const base = $derived(map.config.service === "base");
	const isDataset = $derived(paper.resultType.some((r) => r.toLowerCase() === "dataset"));
	const tags = $derived([...paper.tags, ...(base ? docTypeTags(paper.resultType) : [])]);
	const date = $derived(paper.year ? ` (${paperDate(paper.year)})` : "");
	const title = $derived(paper.title || t(s, "default_paper_title"));
	const authors = $derived(authorsLine(paper.authorsList, selected) || t(s, "default_authors"));
	const actions = $derived(paperActions(map, paper));
	const geo = $derived(!!map.view.places);
	const allTypes = $derived(["base", "orcid", "aquanavi"].includes(map.config.service));

	/** On a geo map, hovering a title lights up its pin. */
	function hover(on: boolean) {
		if (!geo) return;
		if (on) map.hoveredPaper = paper.safeId;
		else if (map.hoveredPaper === paper.safeId) map.hoveredPaper = null;
	}
	const metrics = $derived(paperMetrics(map, paper));
	const showCitations = $derived(!map.config.contentBased && !metrics.length);
	const unit = $derived(map.config.scaleBy ? t(s, scaleUnit(map.config.scaleBy)) : t(s, "readers"));
</script>

<article class="okm-entry" class:selected id="entry-{paper.safeId}">
	{#if paper.oa || paper.freeAccess || isDataset || tags.length}
		<div class="tags">
			{#if paper.oa}
				<Tag tone="accent"><Highlight text="open access" {search} /></Tag>
			{/if}
			{#if paper.freeAccess}
				<Tag tone="accent"><Highlight text="free access" {search} /></Tag>
			{/if}
			{#if isDataset}
				<Tag><Highlight text="dataset" {search} /></Tag>
			{/if}
			{#each tags as tag (tag)}
				<Tag><Highlight text={tag} {search} /></Tag>
			{/each}
		</div>
	{/if}

	<h2 class="title">
		<button
			type="button"
			title={title + date}
			aria-pressed={selected}
			onclick={() => map.selectPaper(paper.safeId)}
			onpointerenter={() => hover(true)}
			onpointerleave={() => hover(false)}
		>
			<Highlight text={selected ? title : shortTitle(title, date.length)} {search} {query} />
			{#if date}
				<Highlight text={date} {search} {query} />
			{/if}
		</button>
	</h2>
	{#if !geo}
		<p class="authors"><Highlight text={authors} {search} {query} /></p>
	{/if}
	{#if paper.publishedIn}
		<p class="source" class:short={!selected}><Highlight text={paper.publishedIn} {search} {query} /></p>
	{/if}
	<p class="link">
		[{paper.listLink?.isDoi ? "doi" : t(s, "link")}]:
		{#if paper.listLink?.address}
			<a href={paper.listLink.address} target="_blank" rel="noreferrer noopener" title="Open link in new tab"
				>{paper.listLink.address}</a
			>
		{:else}
			{t(s, "notAvailable")}
		{/if}
	</p>

	<p class="abstract" class:short={!selected}>
		<Highlight text={paper.abstract || t(s, "default_abstract")} {search} {query} />
	</p>

	{#each paper.comments as c, i (i)}
		<p class="comment">
			<Highlight text={c.comment} {search} />
			{#if c.author}
				<span class="muted">{t(s, "comment_by_label")} {c.author}</span>
			{/if}
		</p>
	{/each}

	{#if selected && geo}
		<p class="row">
			<span class="label">{t(s, "location")}:</span>
			<Highlight text={paper.place?.country || t(s, "location_fallback")} {search} {query} />
		</p>
	{/if}
	{#if selected && map.config.showKeywords && paper.keywords}
		<p class="row">
			<span class="label">{t(s, "keywords")}:</span>
			<Highlight text={paper.keywords} {search} {query} />
		</p>
	{/if}
	{#if selected && allTypes && paper.resultType.length}
		<p class="row">
			<span class="label">{t(s, "documenttypes_label")}:</span>
			<Highlight text={paper.resultType.join(", ")} {search} />
		</p>
	{/if}
	{#if showCitations}
		<p class="row"><strong>{paper.readers}</strong> {unit}</p>
	{/if}
	{#if metrics.length}
		<p class="row metrics">
			{#each metrics as m (m.id)}
				<span data-metric={m.id}><strong>{m.value}</strong> {m.label}</span>
			{/each}
		</p>
	{/if}

	{#if actions.length}
		<div class="actions">
			{#each actions as action (action.id)}
				{#if action.href}
					<Button
						variant={action.primary ? "primary" : "secondary"}
						size="sm"
						href={action.href(map, paper)}
						newTab
						title={action.title}
						>{action.label}</Button
					>
				{:else}
					<Button
						variant={action.primary ? "primary" : "secondary"}
						size="sm"
						title={action.title}
						onclick={() => action.run?.(map, paper)}
						>{action.label}</Button
					>
				{/if}
			{/each}
		</div>
	{/if}

	{#if map.view.areas}
		<p class="row area">
			<span class="label">{t(s, "area")}:</span>
			<button
				type="button"
				title={paper.area}
				onclick={() => map.zoomIn(paper.areaUri)}
				onpointerenter={() => {
					if (map.zoomedArea === null) map.hoveredArea = paper.areaUri;
				}}
				onpointerleave={() => {
					if (map.hoveredArea === paper.areaUri) map.hoveredArea = null;
				}}
			>
				{paper.area}
			</button>
		</p>
	{/if}
</article>

<style>
	.okm-entry {
		padding: var(--space-4);
		border-bottom: 1px solid var(--color-border);
		color: var(--color-text);
		font-size: var(--font-size-sm);
		line-height: var(--line-height-normal);

		&.selected {
			background: var(--color-surface-muted);
		}
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: var(--space-2) 0;
	}

	.metrics {
		display: flex;
		flex-wrap: wrap;
		gap: 0 var(--space-3);
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		margin-bottom: var(--space-2);
	}

	p {
		margin: 0 0 var(--space-1);
		overflow-wrap: anywhere;
	}

	button {
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		text-align: start;
		cursor: pointer;

		&:hover {
			text-decoration: underline;
		}

		&:focus-visible {
			outline: 2px solid var(--color-focus);
			outline-offset: 2px;
		}
	}

	.title {
		margin: 0 0 var(--space-1);
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-semibold);
		line-height: var(--line-height-tight);
	}

	.source {
		color: var(--color-journal);
		font-style: italic;
	}

	.short {
		display: -webkit-box;
		overflow: hidden;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 1;
		line-clamp: 1;
	}

	.abstract {
		margin-top: var(--space-2);

		&.short {
			-webkit-line-clamp: 3;
			line-clamp: 3;
		}
	}

	.link a {
		color: var(--color-link);
	}

	.label,
	.muted {
		color: var(--color-text-muted);
		font-weight: var(--font-weight-semibold);
	}

	.area button {
		text-decoration: underline;
	}
</style>
