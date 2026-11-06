<!--
  @component
  The whole interface for a map. On landscape screens the list sits beside
  the map and the map fits the window's height; on portrait screens the
  list sits below and the map takes the full width.
-->
<script lang="ts">
	import type { MapState } from "./data/state.svelte";
	import List from "./list/List.svelte";
	import KnowledgeMap from "./views/knowledge-map/KnowledgeMap.svelte";

	interface Props {
		state: MapState;
		/** Height available to the map in px (default: the window's). */
		height?: number;
	}

	let { state: map, height }: Props = $props();

	let width = $state(0);
	let innerWidth = $state(1000);
	let innerHeight = $state(800);
	const portrait = $derived(innerHeight >= innerWidth);
	const available = $derived(height ?? innerHeight - 16);
	// Portrait: the list scrolls below, so the map only has to fit the width.
	const size = $derived(Math.max(240, Math.floor(portrait ? width || 600 : Math.min(width || 600, available))));
	$effect(() => map.resize(size));
</script>

<svelte:window bind:innerWidth bind:innerHeight />

<div class="okm-visualization">
	<div class="map" bind:clientWidth={width}>
		<KnowledgeMap state={map} />
	</div>
	<List state={map} />
</div>

<style>
	.okm-visualization {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(280px, 30rem);
		gap: var(--space-4);
		align-items: start;

		> :global(.okm-list) {
			border: 1px solid var(--color-border);
		}

		@media (orientation: portrait) {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	.map {
		min-width: 0;
	}
</style>
