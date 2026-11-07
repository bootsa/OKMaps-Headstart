<!--
  @component
  The whole interface for a map. On landscape screens the list sits beside
  the map and the map fits the window's height; on portrait screens the
  list sits below and the map takes the full width.
-->
<script lang="ts">
	import { untrack } from "svelte";
	import ModalHost from "./components/ModalHost.svelte";
	import SchemeToggle from "./components/SchemeToggle.svelte";
	import type { MapState } from "./data/state.svelte";
	import Header from "./header/Header.svelte";
	import List from "./list/List.svelte";
	import KnowledgeMap from "./views/knowledge-map/KnowledgeMap.svelte";
	import { savedTheme } from "./views/knowledge-map/themes";
	import ThemePicker from "./views/knowledge-map/themes/ThemePicker.svelte";

	interface Props {
		state: MapState;
		/** Height available to the map in px (default: the window's). */
		height?: number;
	}

	let { state: map, height }: Props = $props();

	untrack(() => {
		map.theme = savedTheme();
	});

	let width = $state(0);
	let innerWidth = $state(1000);
	let innerHeight = $state(800);
	const portrait = $derived(innerHeight >= innerWidth);
	let headerHeight = $state(0);
	// Landscape: the map fits the window below the title.
	const available = $derived(height ?? innerHeight - 16 - headerHeight - 16);
	// Portrait: the list scrolls below, so the map only has to fit the width.
	const size = $derived(Math.max(240, Math.floor(portrait ? width || 600 : Math.min(width || 600, available))));
	$effect(() => map.resize(size));
</script>

<svelte:window bind:innerWidth bind:innerHeight />

<div class="okm-visualization">
	<div class="head" bind:clientHeight={headerHeight}><Header state={map} /></div>
	<div class="map" bind:clientWidth={width}>
		<KnowledgeMap state={map} />
		<div class="toolbar">
			<ThemePicker state={map} />
			<SchemeToggle />
		</div>
	</div>
	<List state={map} />
	<ModalHost state={map} />
</div>

<style>
	.okm-visualization {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(280px, 30rem);
		gap: var(--space-4);
		align-items: start;

		> .head {
			grid-column: 1 / -1;
		}

		> :global(.okm-list) {
			border: 1px solid var(--color-border);
		}

		@media (orientation: portrait) {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	.map {
		position: relative;
		min-width: 0;
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		align-items: center;
		position: absolute;
		top: var(--space-2);
		right: var(--space-2);
		padding: 2px var(--space-2);
		border-radius: var(--radius-sm);
		background: var(--color-backdrop);
	}
</style>
