<!--
  @component
  The knowledge map: areas as bubbles with their papers, drawn by the map
  theme the state names (themes/). Hover a bubble to
  see its papers, click it to zoom in, click a paper to select it. Click the
  background or double-click the zoomed bubble to zoom out. Bubbles and
  papers move between the overview and the zoomed positions over 750 ms
  (instantly with reduced motion).
-->
<script lang="ts">
	import type { Area, Paper } from "@okmaps/core";
	import { type Geometry, isNonText, mapGeometry, t } from "@okmaps/core";
	import { cubicInOut } from "svelte/easing";
	import { prefersReducedMotion, Tween } from "svelte/motion";
	import type { MapState } from "../../data/state.svelte";
	import { getTheme } from "./themes";

	interface Props {
		state: MapState;
		/** Zoom animation length in ms. */
		duration?: number;
	}

	let { state: map, duration = 750 }: Props = $props();

	const size = $derived(map.map.size);
	const theme = $derived(getTheme(map.theme));
	const AreaShape = $derived(theme.Area);
	const PaperShape = $derived(theme.Paper);
	const Popup = $derived(theme.Popup);
	const target: Geometry = $derived(
		mapGeometry(map.map.areas, map.map.papers, size, map.area, {
			inset: theme.shape.inset,
			placePapers: theme.placePapers,
		}),
	);

	// The geometry drawn: the target, tweened when zooming.
	const geometry = new Tween<Geometry>({ areas: {}, papers: {} }, { easing: cubicInOut });
	let moving = $state(false);
	let lastSize = 0;
	let lastTheme = "";
	$effect(() => {
		const next = target;
		// Zooming animates; a new size or theme just redraws.
		const animate = lastSize === size && lastTheme === theme.id && !prefersReducedMotion.current;
		lastSize = size;
		lastTheme = theme.id;
		moving = animate;
		geometry.set(next, { duration: animate ? duration : 0 }).then(() => {
			if (geometry.target === next) moving = false;
		});
	});

	let hoveredPaper: string | null = $state(null);
	const hovered = $derived(map.map.papers.find((p) => p.safeId === hoveredPaper));
	// A new zoom starts without a popup.
	$effect(() => {
		void map.zoomedArea;
		hoveredPaper = null;
	});

	const zoom = $derived(map.zoomedArea !== null);
	const shown = $derived(map.map.papers.filter((p) => map.matching.has(p.safeId)));
	const active = (p: Paper) => p.areaUri === map.hoveredArea || p.areaUri === map.zoomedArea;
	const inactivePapers = $derived(zoom ? [] : shown.filter((p) => !active(p)));
	const activePapers = $derived(
		shown.filter(active).sort((a, b) => Number(a.safeId === hoveredPaper) - Number(b.safeId === hoveredPaper)),
	);
	const onTop = (a: Area) => (a.uri === map.zoomedArea ? 2 : a.uri === map.hoveredArea ? 1 : 0);
	const areas = $derived([...map.map.areas].sort((a, b) => onTop(a) - onTop(b)));

	function clickArea(area: Area) {
		if (area.uri === map.zoomedArea) {
			if (map.selectedPaper) map.deselectPaper();
			return;
		}
		map.zoomIn(area.uri);
	}

	function clickPaper(e: MouseEvent | KeyboardEvent, paper: Paper) {
		if (!zoom) {
			map.zoomIn(paper.areaUri);
			return;
		}
		e.stopPropagation();
		if (map.selectedPaper !== paper.safeId) map.selectPaper(paper.safeId);
	}

	function clickBackground() {
		if (zoom) map.zoomOut();
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === "Escape" && zoom) map.zoomOut();
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<svg
	class="okm-knowledge-map"
	class:zoom
	width={size}
	height={size}
	viewBox="0 0 {size} {size}"
	role="group"
	aria-label={t(map.strings, "area")}
	{onkeydown}
>
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<rect
		class="background"
		x={zoom ? -500 : 0}
		y={zoom ? -500 : 0}
		width={zoom ? size + 1000 : size}
		height={zoom ? size + 1000 : size}
		onclick={clickBackground}
		onpointerenter={() => {
			if (!zoom) map.hoveredArea = null;
		}}
	/>
	{#snippet paperShape(paper: Paper)}
		{@const rect = geometry.current.papers[paper.safeId]}
		{#if rect}
			<PaperShape
				{paper}
				{rect}
				{size}
				{zoom}
				selected={map.selectedPaper === paper.safeId}
				hovered={zoom && hoveredPaper === paper.safeId}
				rounded={isNonText(paper)}
				search={map.searchWords}
				query={map.queryWords}
				onclick={(e) => clickPaper(e, paper)}
				onpointerenter={() => {
					if (zoom) hoveredPaper = paper.safeId;
				}}
				onpointerleave={() => {
					if (hoveredPaper === paper.safeId) hoveredPaper = null;
				}}
			/>
		{/if}
	{/snippet}
	{#each inactivePapers as paper (paper.safeId)}
		{@render paperShape(paper)}
	{/each}
	{#each areas as area (area.uri)}
		{@const circle = geometry.current.areas[area.uri]}
		{#if circle}
			<AreaShape
				title={area.title}
				{circle}
				shape={theme.shape}
				hovered={map.hoveredArea === area.uri}
				zoomed={map.zoomedArea === area.uri}
				dimmed={zoom && map.zoomedArea !== area.uri}
				showTitle={!zoom && !moving && map.hoveredArea !== area.uri}
				query={map.queryWords}
				onclick={() => clickArea(area)}
				ondblclick={() => {
					if (map.zoomedArea === area.uri) map.zoomOut();
				}}
				onpointerenter={() => {
					if (!zoom) map.hoveredArea = area.uri;
				}}
			/>
		{/if}
	{/each}
	{#each activePapers as paper (paper.safeId)}
		{@render paperShape(paper)}
	{/each}
	{#if Popup && zoom && !moving && hovered && geometry.current.papers[hovered.safeId]}
		<Popup
			paper={hovered}
			rect={geometry.current.papers[hovered.safeId]}
			{size}
			search={map.searchWords}
			query={map.queryWords}
		/>
	{/if}
</svg>

<style>
	.okm-knowledge-map {
		display: block;
		overflow: hidden;
		font-family: var(--font-sans);
		user-select: none;
	}

	.background {
		fill: var(--color-surface);

		.zoom & {
			cursor: zoom-out;
		}
	}
</style>
