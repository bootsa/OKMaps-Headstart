<!--
  @component
  One paper on the knowledge map: a sheet with a folded corner (a rounded
  card for datasets and media) showing its title, year, authors, journal
  and a metric. All metadata is rendered as text.
-->
<script lang="ts">
	import Highlight from "../../components/Highlight.svelte";
	import { paperDate } from "../../data/papers";
	import type { Paper } from "../../data/types";
	import { cutAuthors, DOGEAR, dogEarPath, paperPath, type Rect, roundedPath } from "./geometry";

	interface Props {
		paper: Paper;
		rect: Rect;
		/** The map is zoomed into an area (larger text, hover enlarges). */
		zoom?: boolean;
		selected?: boolean;
		hovered?: boolean;
		/** Dataset, media or software: drawn as a rounded card. */
		rounded?: boolean;
		/** Metrics to show; the first one unless hovered. */
		stats?: Array<{ value: number | string; label: string }>;
		search?: string[];
		query?: string[];
		onclick?: (e: MouseEvent | KeyboardEvent) => void;
		onpointerenter?: () => void;
		onpointerleave?: () => void;
	}

	let {
		paper,
		rect,
		zoom = false,
		selected = false,
		hovered = false,
		rounded = false,
		stats = [],
		search = [],
		query = [],
		onclick,
		onpointerenter,
		onpointerleave,
	}: Props = $props();

	const shown = $derived(hovered ? stats : stats.slice(0, 1));
	const authors = $derived(paper.authorsList.length > 15 ? cutAuthors(paper.authorsList, 15) : paper.authorsString);

	function onkeydown(e: KeyboardEvent) {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			onclick?.(e);
		}
	}
</script>

<!-- Overview papers are not focusable: their bubble is (role is set per zoom). -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<g
	class="okm-paper"
	class:zoom
	class:hovered
	class:selected
	role={zoom ? "button" : "presentation"}
	tabindex={zoom ? 0 : undefined}
	aria-pressed={zoom ? selected : undefined}
	{onclick}
	{onkeydown}
	{onpointerenter}
	{onpointerleave}
	onfocus={onpointerenter}
	onblur={onpointerleave}
>
	{#if !zoom}
		<title>{paper.area}</title>
	{/if}
	<path class="sheet" d={rounded ? roundedPath(rect) : paperPath(rect)} />
	{#if !rounded}
		<path class="dogear" d={dogEarPath(rect)} />
	{/if}
	<foreignObject x={rect.x} y={rect.y} width={Math.max(0, rect.w)} height={Math.max(0, rect.h)}>
		<div class="holder" style:width="{rect.w}px" style:height="{rect.h}px">
			<div class="metadata" style:width="{(1 - DOGEAR) * rect.w}px">
				<p class="title">
					<Highlight text={paper.title} {search} {query} />
					{#if paper.year}
						<Highlight text="({paperDate(paper.year)})" {search} {query} />
					{/if}
				</p>
				<p class="authors"><Highlight text={authors} {search} /></p>
				{#if paper.publishedIn}
					<p class="in">in <Highlight text={paper.publishedIn} {search} /></p>
				{/if}
			</div>
			{#each shown as stat (stat.label)}
				<p class="stat"><strong>{stat.value}</strong> {stat.label}</p>
			{/each}
		</div>
	</foreignObject>
</g>

<style>
	.okm-paper {
		--paper-font-size: 3px;
		cursor: zoom-in;
		outline: none;

		&.zoom {
			--paper-font-size: 12px;
			cursor: pointer;
		}

		&.hovered {
			--paper-font-size: 14px;
		}
	}

	.sheet {
		fill: var(--color-paper-fill);
		stroke: var(--color-paper);
		stroke-width: 1px;

		.selected & {
			stroke: var(--color-text);
			stroke-width: 3px;
		}

		.okm-paper:focus-visible & {
			stroke: var(--color-focus);
			stroke-width: 3px;
		}
	}

	.dogear {
		fill: var(--color-paper);
		stroke: var(--color-paper);
	}

	.holder {
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
		padding: 2% 3%;
		overflow: hidden;
		color: var(--color-text);
		font-size: var(--paper-font-size);
		line-height: 1.2;
		pointer-events: none;
	}

	.metadata {
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	p {
		margin: 0 0 0.25em;
		overflow-wrap: break-word;
		hyphens: auto;
	}

	.title {
		font-weight: var(--font-weight-bold);
	}

	.in {
		font-style: italic;
	}

	.stat {
		margin: 0;
		white-space: nowrap;
	}
</style>
