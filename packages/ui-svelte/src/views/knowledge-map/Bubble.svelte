<!--
  @component
  One area of the knowledge map: a circle with its title inside. The title is
  plain text (the old map injected it as HTML).
-->
<script lang="ts">
	import Highlight from "../../components/Highlight.svelte";
	import type { Circle } from "./geometry";

	interface Props {
		title: string;
		circle: Circle;
		/** Under the pointer (overview). */
		hovered?: boolean;
		/** The area zoomed into. */
		zoomed?: boolean;
		/** Another area is zoomed into. */
		dimmed?: boolean;
		/** Show the title (hidden while hovered, zoomed or moving). */
		showTitle?: boolean;
		query?: string[];
		onclick?: () => void;
		ondblclick?: () => void;
		onpointerenter?: () => void;
	}

	let {
		title,
		circle,
		hovered = false,
		zoomed = false,
		dimmed = false,
		showTitle = true,
		query = [],
		onclick,
		ondblclick,
		onpointerenter,
	}: Props = $props();

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
	tabindex={zoomed ? -1 : 0}
	{onclick}
	{ondblclick}
	{onpointerenter}
	{onkeydown}
	onfocus={onpointerenter}
>
	<circle cx={circle.x} cy={circle.y} r={Math.max(0, circle.r)}><title>{title}</title></circle>
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

	circle {
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
			fill: #000;
			fill-opacity: 0.1;
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
