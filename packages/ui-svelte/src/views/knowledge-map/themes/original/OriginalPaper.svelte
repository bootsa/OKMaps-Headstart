<!--
  @component
  One paper in the original style: a sheet with a folded corner (a rounded
  card for datasets and media) with its title, year, authors and journal
  written on it. Zoomed in, the paper under the pointer grows to twice its
  size (at most half the chart). All metadata is rendered as text.
-->
<script lang="ts">
	import { cutAuthors, DOGEAR, dogEarPath, enlarge, paperDate, paperPath, roundedPath } from "@okmaps/core";
	import Highlight from "../../../../components/Highlight.svelte";
	import type { PaperProps } from "../types";

	let {
		paper,
		rect: place,
		size,
		zoom = false,
		selected = false,
		hovered = false,
		rounded = false,
		search = [],
		query = [],
		onclick,
		onpointerenter,
		onpointerleave,
	}: PaperProps = $props();

	const rect = $derived(zoom && hovered ? enlarge(place, size) : place);
	const authors = $derived(paper.authorsList.length > 15 ? cutAuthors(paper.authorsList, 15) : paper.authorsString);

	function onkeydown(e: KeyboardEvent) {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			onclick?.(e);
		}
	}
</script>

<!-- Overview papers are not focusable: their bubble is (role is set per zoom).
     Chromium makes an SVG element with focus listeners focusable, so they go too. -->
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
	{...zoom ? { onfocus: onpointerenter, onblur: onpointerleave } : {}}
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
</style>
