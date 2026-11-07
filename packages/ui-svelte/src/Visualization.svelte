<!--
  @component
  The whole interface for a map, filling its height (the window's by
  default): the title on top, the map below it, and the list in a drawer.
  On wide screens the drawer sits beside the map and starts open; on narrow
  ones it slides over the map, starts closed, and opens when a paper is
  picked on the map. Display settings sit behind a round button at the
  bottom right of the map.
-->
<script lang="ts">
	import { untrack } from "svelte";
	import { fly } from "svelte/transition";
	import ModalHost from "./components/ModalHost.svelte";
	import ScalePicker from "./components/ScalePicker.svelte";
	import SchemeToggle from "./components/SchemeToggle.svelte";
	import SettingsMenu from "./components/SettingsMenu.svelte";
	import type { MapState } from "./data/state.svelte";
	import Header from "./header/Header.svelte";
	import List from "./list/List.svelte";
	import { activePlugins } from "./plugins";
	import Geomap from "./views/geomap/Geomap.svelte";
	import KnowledgeMap from "./views/knowledge-map/KnowledgeMap.svelte";
	import { savedTheme } from "./views/knowledge-map/themes";
	import ThemePicker from "./views/knowledge-map/themes/ThemePicker.svelte";
	import Streamgraph from "./views/streamgraph/Streamgraph.svelte";

	interface Props {
		state: MapState;
		/** Height of the whole interface in px (default: the window's). */
		height?: number;
		/** More for the settings panel, e.g. the page's own links. */
		menu?: HTMLElement | null;
	}

	let { state: map, height, menu = null }: Props = $props();

	/** From this width the drawer sits beside the map instead of over it. */
	const DOCK_WIDTH = 900;

	untrack(() => {
		map.theme = savedTheme();
		map.listFit = true;
	});

	let innerHeight = $state(800);
	let width = $state(0);
	let headerHeight = $state(0);
	let drawerWidth = $state(0);
	const docked = $derived(width === 0 || width >= DOCK_WIDTH);
	const total = $derived(height ?? innerHeight);
	const stageHeight = $derived(Math.max(240, total - headerHeight));
	const mapWidth = $derived((width || 600) - (docked && map.listVisible ? drawerWidth : 0));
	const size = $derived(Math.max(240, Math.floor(Math.min(mapWidth, stageHeight))));
	$effect(() => map.resize(size));

	// Narrow screens start with the map; the list waits in the drawer.
	let started = false;
	$effect(() => {
		if (started || width === 0) return;
		started = true;
		if (width < DOCK_WIDTH) untrack(() => (map.listVisible = false));
	});

	// Picking a paper on the map of a narrow screen shows it in the list.
	$effect(() => {
		if ((map.selectedPaper || map.selectedStream) && !docked) untrack(() => (map.listVisible = true));
	});

	const reduceMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
	const count = $derived(map.listed.length);
	const overlays = $derived(activePlugins().flatMap((p) => p.overlays ?? []));
</script>

<svelte:window bind:innerHeight />

<div class="okm-visualization" class:docked bind:clientWidth={width} style:height="{total}px">
	<div class="head" bind:clientHeight={headerHeight}><Header state={map} /></div>
	<div class="stage">
		<div class="map" style:--okm-overlay-bottom={map.config.visType === "geomap" ? "2.25rem" : null}>
			{#if map.config.visType === "timeline"}
				<Streamgraph state={map} width={mapWidth} height={stageHeight} />
			{:else if map.config.visType === "geomap"}
				<Geomap state={map} width={mapWidth} height={stageHeight} />
			{:else}
				<KnowledgeMap state={map} />
			{/if}
			{#each overlays as overlay, i (i)}
				<overlay.component state={map} {...overlay.props} />
			{/each}
			<div class="settings">
				<SettingsMenu>
					<ScalePicker state={map} />
					<ThemePicker state={map} />
					<SchemeToggle />
					{#if menu}
						<div class="menu" {@attach (el) => el.append(menu)}></div>
					{/if}
				</SettingsMenu>
			</div>
		</div>
		{#if map.listVisible}
			<aside
				class="drawer"
				bind:clientWidth={drawerWidth}
				transition:fly={{ x: 320, duration: reduceMotion || docked ? 0 : 200 }}
			>
				<List state={map} fitToggle={false} onclose={docked ? undefined : () => (map.listVisible = false)} />
			</aside>
		{:else}
			<button type="button" class="open-list" aria-expanded="false" onclick={() => (map.listVisible = true)}>
				<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
					<path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
				</svg>
				List <span class="count">({count})</span>
			</button>
		{/if}
	</div>
	<ModalHost state={map} />
</div>

<style>
	.okm-visualization {
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
		min-height: 0;
		overflow: hidden;
		background: var(--color-surface);
		color: var(--color-text);

		> .head {
			flex: none;
			padding: var(--space-2) var(--space-4) var(--space-1);
		}
	}

	.stage {
		position: relative;
		display: flex;
		flex: 1;
		min-height: 0;
	}

	.map {
		position: relative;
		display: flex;
		flex: 1;
		align-items: center;
		justify-content: center;
		min-width: 0;
	}

	.settings {
		position: absolute;
		right: var(--space-4);
		bottom: var(--okm-overlay-bottom, var(--space-4));
		z-index: 2;
	}

	.menu {
		display: contents;
	}

	.drawer {
		position: absolute;
		inset: 0 0 0 auto;
		z-index: 3;
		display: flex;
		width: min(100%, 28rem);
		border-left: 1px solid var(--color-border);
		background: var(--color-surface);
		box-shadow: var(--shadow-overlay);

		> :global(.okm-list) {
			flex: 1;
			position: static;
			max-height: none;
		}
	}

	.docked .drawer {
		position: relative;
		inset: auto;
		flex: none;
		width: clamp(300px, 32%, 30rem);
		box-shadow: none;
	}

	.open-list {
		position: absolute;
		top: var(--space-2);
		right: var(--space-4);
		z-index: 2;
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-1) var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-pill);
		background: var(--color-surface);
		color: var(--color-text);
		box-shadow: var(--shadow-raised);
		font: inherit;
		font-family: var(--font-sans);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		cursor: pointer;

		.count {
			color: var(--color-text-muted);
			font-weight: normal;
		}

		&:focus-visible {
			outline: 2px solid var(--color-focus);
			outline-offset: 2px;
		}
	}
</style>
