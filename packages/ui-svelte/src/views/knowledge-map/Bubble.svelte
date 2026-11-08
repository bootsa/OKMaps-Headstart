<!--
  @component
  One area of the knowledge map: its outline (a circle unless the theme's
  shape says otherwise) with its title inside. The title is
  plain text (the old map injected it as HTML).
-->
<script lang="ts">
	import Highlight from "../../components/Highlight.svelte";
	import { circleShape } from "./themes/shapes";
	import type { AreaProps } from "./themes/types";

	let {
		title,
		circle,
		shape = circleShape,
		hovered = false,
		zoomed = false,
		dimmed = false,
		showTitle = true,
		query = [],
		onclick,
		ondblclick,
		onpointerenter,
	}: AreaProps = $props();

	const side = $derived((2 * circle.r) / Math.SQRT2);

	function onkeydown(e: KeyboardEvent) {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			onclick?.();
		}
	}
</script>

<g
	class="okm-bubble"
	class:hovered
	class:zoomed
	class:dimmed
	role="button"
	aria-label={title}
	tabindex={zoomed ? -1 : 0}
	{onclick}
	{ondblclick}
	{onpointerenter}
	{onkeydown}
	onfocus={onpointerenter}
>
	<path class="outline" d={shape.path({ ...circle, r: Math.max(0, circle.r) })}><title>{title}</title></path>
	{#if showTitle}
		<foreignObject x={circle.x - side / 2} y={circle.y - side / 2} width={side} height={side}>
			<div class="title" style:height="{side}px" style:--lines={Math.max(1, Math.floor(side / 17))}>
				<h2><Highlight text={title} {query} /></h2>
			</div>
		</foreignObject>
	{/if}
</g>

<style>
	.okm-bubble {
		cursor: zoom-in;
		outline: none;

		&.zoomed {
			cursor: default;
		}
	}

	.outline {
		fill: var(--color-area-fill);
		fill-opacity: 0.9;
		stroke: var(--color-area-stroke);
		stroke-width: 1px;

		.hovered &,
		.zoomed & {
			fill-opacity: 1;
		}

		.zoomed & {
			stroke-width: 2px;
		}

		.dimmed & {
			fill: var(--color-area-dimmed);
			fill-opacity: 1;
			stroke-width: 0;
		}

		.okm-bubble:focus-visible & {
			stroke: var(--color-focus);
			stroke-width: 3px;
		}
	}

	.title {
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		pointer-events: none;
	}

	h2 {
		display: -webkit-box;
		margin: 0;
		overflow: hidden;
		color: var(--color-area-title);
		font-size: 14px;
		font-weight: var(--font-weight-semibold);
		line-height: 1.2;
		text-align: center;
		overflow-wrap: break-word;
		hyphens: auto;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: var(--lines);
		line-clamp: var(--lines);
	}
</style>
