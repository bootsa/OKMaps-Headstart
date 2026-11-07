<!--
  @component
  One paper on the knowledge map: a small document icon (a rounded card for
  datasets and media; a dot inside for open access). Zoomed in, its title
  sits beside the icon at a readable size; the full details show in a
  popup on hover or focus (PaperPopup). All metadata is rendered as text.
-->
<script lang="ts">
	import Highlight from "../../../../components/Highlight.svelte";
	import { paperDate } from "../../../../data/papers";
	import { dogEarPath, iconRect, paperPath, roundedPath, labelWidth as titleWidth } from "../../geometry";
	import type { PaperProps } from "../types";

	let {
		paper,
		rect,
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

	const icon = $derived(iconRect(rect, zoom));
	const labelWidth = $derived(titleWidth(size));
	const date = $derived(paper.year ? ` (${paperDate(paper.year)})` : "");
	const dot = $derived(Math.max(1.5, icon.w * 0.18));
	const left = $derived(icon.x + icon.w + 6 + labelWidth > size);

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
	class:oa={paper.oa}
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
	<path class="sheet" d={rounded ? roundedPath({ ...icon, r: Math.min(icon.w, icon.h) / 4 }) : paperPath(icon)} />
	{#if !rounded}
		<path class="dogear" d={dogEarPath(icon)} />
	{/if}
	{#if paper.oa}
		<circle class="oa-dot" cx={icon.x + icon.w / 2} cy={icon.y + icon.h * 0.6} r={dot} />
	{/if}
	{#if zoom}
		<foreignObject
			x={left ? icon.x - 6 - labelWidth : icon.x + icon.w + 6}
			y={icon.y + icon.h / 2 - 17}
			width={labelWidth}
			height="34"
		>
			<div class="label" class:left>
				<Highlight text={paper.title} {search} {query} />
				{#if date}
					<Highlight text={date} {search} {query} />
				{/if}
			</div>
		</foreignObject>
	{/if}
</g>

<style>
	.okm-paper {
		cursor: zoom-in;
		outline: none;

		&.zoom {
			cursor: pointer;
		}
	}

	.sheet {
		fill: var(--color-paper-fill);
		stroke: var(--color-text-muted);
		stroke-width: 1px;

		.okm-paper:not(.zoom) & {
			stroke: var(--color-paper);
		}

		.hovered &,
		.selected & {
			stroke: var(--color-text);
			stroke-width: 2px;
		}

		.okm-paper:focus-visible & {
			stroke: var(--color-focus);
			stroke-width: 3px;
		}
	}

	.dogear {
		fill: var(--color-paper);
		stroke: var(--color-text-muted);
		stroke-width: 1px;

		.okm-paper:not(.zoom) & {
			stroke: var(--color-paper);
		}
	}

	.oa-dot {
		fill: var(--color-open-access);
	}

	.label {
		display: -webkit-box;
		box-sizing: border-box;
		width: fit-content;
		max-height: 34px;
		padding: 1px 3px;
		overflow: hidden;
		border-radius: var(--radius-sm);
		/* Keeps a title legible where it crosses a neighbour. */
		background: var(--color-backdrop);
		color: var(--color-text);
		font-size: 12px;
		line-height: 16px;
		overflow-wrap: anywhere;
		pointer-events: none;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;

		&.left {
			margin-left: auto;
			text-align: right;
		}

		.hovered &,
		.selected & {
			font-weight: var(--font-weight-bold);
		}
	}
</style>
