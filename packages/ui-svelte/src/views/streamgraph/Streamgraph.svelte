<!--
  @component
  A streamgraph: how often each keyword appears among the map's resources
  over the years, as stacked streams. Hovering a stream shows its count
  for the year under the pointer; clicking it (or its label) lists its
  resources, clicking the background shows all again. Streams are buttons,
  so the keyboard can pick them too.
-->
<script lang="ts">
	import { max, min } from "d3-array";
	import { scaleLinear, scaleTime } from "d3-scale";
	import { curveMonotoneX, area as d3area } from "d3-shape";
	import type { MapState } from "../../data/state.svelte";
	import type { Stream } from "../../data/types";
	import { t } from "../../i18n/strings";
	import { BORDER, labelBox, SWATCH_GAP, SWATCH_WIDTH, separateLabels } from "./labels";

	interface Props {
		state: MapState;
		width: number;
		height: number;
	}

	let { state: map, width, height }: Props = $props();

	// Room at the bottom for the axis and whatever the plugins draw over the chart (credit, settings button).
	const M = { top: 20, right: 50, bottom: 100, left: 70 };
	const FONT = 12;
	const MAX_TICKS_X = 8;

	type Point = Stream["points"][number];

	const s = $derived(map.strings);
	const streams = $derived(map.map.streams);
	const w = $derived(Math.max(100, width - M.left - M.right));
	const h = $derived(Math.max(100, height - M.top - M.bottom));
	const points = $derived(streams.flatMap((st) => st.points));
	const first = $derived(min(points, (p) => p.date) ?? new Date(2000, 0, 1));
	const last = $derived(max(points, (p) => p.date) ?? new Date(2001, 0, 1));
	const low = $derived(min(points, (p) => p.y0) ?? 0);
	const high = $derived(max(points, (p) => p.y1) ?? 1);
	const x = $derived(scaleTime().domain([first, last]).range([0, w]));
	const y = $derived(scaleLinear().domain([low, high]).range([h, 0]));
	const shape = $derived(
		d3area<Point>()
			.curve(curveMonotoneX)
			.x((p) => x(p.date))
			.y0((p) => y(p.y0))
			.y1((p) => y(p.y1)),
	);
	const color = (i: number) => map.config.streamgraphColors[i % map.config.streamgraphColors.length];

	// Axes: years along the bottom, numbers of resources (from 0) up the side.
	const xTicks = $derived.by(() => {
		const from = first.getFullYear();
		const to = last.getFullYear();
		const step = Math.max(1, Math.ceil((to - from + 1) / MAX_TICKS_X));
		const years: number[] = [];
		for (let year = from; year <= to; year += step) years.push(year);
		return years;
	});
	const yTicks = $derived.by(() => {
		const total = high - low;
		return scaleLinear()
			.domain([0, total])
			.ticks(total <= 8 ? Math.max(1, Math.floor(total)) : 10)
			.filter(Number.isInteger);
	});

	const labels = $derived(
		separateLabels(
			streams.map((st) => {
				const peak = st.points.reduce((a, b) => (b.value > a.value ? b : a), st.points[0]);
				return labelBox(
					st.key,
					{ x: x(peak.date), top: y(peak.y1), bottom: y(peak.y0) },
					st.key.length * FONT * 0.58,
					FONT + 2,
					w,
				);
			}),
		),
	);

	let hovered: string | null = $state(null);
	let pointer: { x: number; y: number } | null = $state(null);
	const selected = $derived(map.selectedStream);
	const dim = (key: string) => (selected !== null || hovered !== null) && key !== selected && key !== hovered;

	const tip = $derived.by(() => {
		if (!pointer || hovered === null) return null;
		const stream = streams.find((st) => st.key === hovered);
		if (!stream) return null;
		const year = x.invert(pointer.x - M.left).getFullYear();
		const point = stream.points.find((p) => p.date.getFullYear() === year);
		if (!point) return null;
		const total = stream.points.reduce((sum, p) => sum + p.value, 0);
		const index = streams.indexOf(stream);
		return { year, key: stream.key, value: point.value, total, color: color(index) };
	});

	let root: HTMLDivElement | undefined = $state();
	function track(e: PointerEvent) {
		if (!root) return;
		const box = root.getBoundingClientRect();
		pointer = { x: e.clientX - box.left, y: e.clientY - box.top };
	}

	function pick(key: string) {
		map.selectStream(selected === key ? null : key);
	}

	function onkey(e: KeyboardEvent, key: string) {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			pick(key);
		}
	}

	const label = (key: string) => key || "NO_LABEL";
</script>

<div
	class="okm-streamgraph"
	bind:this={root}
	style:width="{width}px"
	style:height="{height}px"
	onpointermove={track}
	onpointerleave={() => (pointer = null)}
	role="presentation"
>
	<svg {width} {height} aria-label={t(s, "streamgraph_label")}>
		<g transform="translate({M.left},{M.top})">
			<rect
				class="background"
				width={w}
				height={h}
				onclick={() => map.selectStream(null)}
				onpointerenter={() => (hovered = null)}
				role="presentation"
			/>
			{#each streams as stream, i (stream.key)}
				<path
					class="stream"
					class:dim={dim(stream.key)}
					d={shape(stream.points)}
					fill={color(i)}
					role="button"
					tabindex="0"
					aria-pressed={selected === stream.key}
					aria-label="{label(stream.key)}: {stream.docIds.length} {t(s, "stream_docs").toLowerCase()}"
					onclick={() => pick(stream.key)}
					onkeydown={(e) => onkey(e, stream.key)}
					onpointerenter={() => (hovered = stream.key)}
					onpointerleave={() => (hovered = null)}
					onfocus={() => (hovered = stream.key)}
					onblur={() => (hovered = null)}
				/>
			{/each}

			<g class="axis" transform="translate(0,{h})">
				<line x2={w} />
				{#each xTicks as year (year)}
					{@const at = x(new Date(year, 0, 1))}
					<g transform="translate({at},0)">
						<line y2="6" />
						<text y="20" text-anchor="middle">{year}</text>
					</g>
				{/each}
				<text class="axis-label" x={w / 2} y="45" text-anchor="middle">{t(s, "stream_year")}</text>
			</g>
			<g class="axis">
				<line y2={h} />
				{#each yTicks as n (n)}
					<g transform="translate(0,{y(low + n)})">
						<line x2="-6" />
						<text x="-9" dy="0.32em" text-anchor="end">{n}</text>
					</g>
				{/each}
				<text class="axis-label" text-anchor="middle" transform="translate(-45,{h / 2}) rotate(-90)">
					{t(s, "stream_doc_num")}
				</text>
			</g>

			{#each labels as box (box.key)}
				{@const i = streams.findIndex((st) => st.key === box.key)}
				<g
					class="label"
					transform="translate({box.x},{box.y})"
					onclick={() => pick(box.key)}
					onpointerenter={() => (hovered = box.key)}
					onpointerleave={() => (hovered = null)}
					role="presentation"
				>
					<rect
						class="label-background"
						x={-BORDER}
						y={-FONT - BORDER + 2}
						width={box.width - 2}
						height={box.height - 2}
						rx="4"
					/>
					<rect y="-9" width={SWATCH_WIDTH} height="8" rx="2" fill={color(i)} />
					<text x={SWATCH_WIDTH + SWATCH_GAP}>{label(box.key)}</text>
				</g>
			{/each}
		</g>
	</svg>

	{#if pointer && pointer.x > M.left && pointer.x < M.left + w}
		<div class="line" style:left="{pointer.x}px" style:top="{M.top}px" style:height="{h}px"></div>
	{/if}
	{#if tip && pointer}
		<div class="tip" style:left="{pointer.x + 10}px" style:top="{Math.max(0, pointer.y - 10)}px" role="tooltip">
			<div class="year">{tip.year}</div>
			<div class="key"><span class="swatch" style:background={tip.color}></span>{label(tip.key)}</div>
			<div>{t(s, "stream_docs")} {tip.year}: {tip.value}</div>
			<div>{t(s, "stream_total")}: {tip.total}</div>
		</div>
	{/if}
</div>

<style>
	.okm-streamgraph {
		position: relative;
		color: var(--color-text);
		font-family: var(--font-sans);
		user-select: none;
	}

	svg {
		display: block;
		overflow: visible;
	}

	.background {
		fill: none;
		pointer-events: all;
	}

	.stream {
		stroke: var(--color-surface);
		stroke-width: 0.5;
		cursor: pointer;
		transition: opacity 100ms;

		&.dim {
			opacity: 0.25;
		}

		&:focus-visible {
			outline: none;
			stroke: var(--color-focus);
			stroke-width: 2;
		}
	}

	.axis {
		line {
			stroke: var(--color-text-muted);
		}

		text {
			fill: var(--color-text-muted);
			font-size: 12px;
		}

		.axis-label {
			fill: var(--color-text);
			font-size: 13px;
		}
	}

	.label {
		cursor: pointer;
		font-size: 12px;

		text {
			fill: var(--color-text);
		}
	}

	.label-background {
		fill: var(--color-surface);
		fill-opacity: 0.9;
		stroke: var(--color-border);
	}

	.line {
		position: absolute;
		width: 1px;
		background: var(--color-text-muted);
		pointer-events: none;
	}

	.tip {
		position: absolute;
		z-index: 2;
		max-width: 16rem;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
		box-shadow: var(--shadow-raised);
		font-size: var(--font-size-sm);
		pointer-events: none;

		.year {
			font-weight: var(--font-weight-bold);
		}

		.key {
			display: flex;
			align-items: center;
			gap: var(--space-1);
		}

		.swatch {
			display: inline-block;
			width: 15px;
			height: 10px;
		}
	}
</style>
