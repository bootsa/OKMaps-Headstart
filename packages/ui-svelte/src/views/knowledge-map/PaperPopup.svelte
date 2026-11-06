<!--
  @component
  The details of the paper under the pointer (or keyboard focus), next to
  its icon on the zoomed-in map: access tags, title, authors and journal.
  All text, never HTML.
-->
<script lang="ts">
	import Highlight from "../../components/Highlight.svelte";
	import Tag from "../../components/Tag.svelte";
	import { paperDate } from "../../data/papers";
	import type { Paper } from "../../data/types";
	import { cutAuthors, popupPlacement, type Rect } from "./geometry";

	interface Props {
		paper: Paper;
		/** The paper's icon. */
		icon: Rect;
		/** Chart size in px, to keep the popup inside. */
		size: number;
		search?: string[];
		query?: string[];
	}

	let { paper, icon, size, search = [], query = [] }: Props = $props();

	const WIDTH = 260;
	let height = $state(120);
	const at = $derived(popupPlacement(icon, size, WIDTH, height));
	const authors = $derived(cutAuthors(paper.authorsList, 15));
	const isDataset = $derived(paper.resultType.some((r) => r.toLowerCase() === "dataset"));
</script>

<foreignObject class="okm-popup" x={at.x} y={at.y} width={WIDTH} {height} aria-hidden="true">
	<div class="card" bind:offsetHeight={height}>
		{#if paper.oa || paper.freeAccess || isDataset}
			<div class="tags">
				{#if paper.oa}
					<Tag tone="accent">open access</Tag>
				{/if}
				{#if paper.freeAccess}
					<Tag tone="accent">free access</Tag>
				{/if}
				{#if isDataset}
					<Tag>dataset</Tag>
				{/if}
			</div>
		{/if}
		<p class="title">
			<Highlight text={paper.title} {search} {query} />
			{#if paper.year}
				<Highlight text=" ({paperDate(paper.year)})" {search} {query} />
			{/if}
		</p>
		{#if authors}
			<p><Highlight text={authors} {search} {query} /></p>
		{/if}
		{#if paper.publishedIn}
			<p class="source"><Highlight text={paper.publishedIn} {search} {query} /></p>
		{/if}
	</div>
</foreignObject>

<style>
	.okm-popup {
		overflow: visible;
		pointer-events: none;
	}

	.card {
		box-sizing: border-box;
		width: 260px;
		padding: var(--space-3);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		box-shadow: var(--shadow-overlay);
		color: var(--color-text);
		font-size: var(--font-size-xs);
		line-height: 1.4;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		margin-bottom: var(--space-1);
	}

	p {
		margin: 0 0 2px;
		overflow-wrap: anywhere;
	}

	.title {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-bold);
		line-height: var(--line-height-tight);
		margin-bottom: var(--space-1);
	}

	.source {
		color: var(--color-journal);
		font-style: italic;
	}
</style>
