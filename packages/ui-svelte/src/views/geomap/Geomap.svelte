<!--
  @component
  A geo map: a pin per resource with a place (AQUANAVI's facilities), on
  OpenStreetMap tiles with Leaflet. Picking a pin selects its resource in
  the list; clicking the map elsewhere deselects it. Pins are buttons, so
  Tab and Enter work; + and - zoom when the map has focus. Leaflet loads
  only when a geo map is shown.
-->
<script lang="ts">
	import type { Paper } from "@okmaps/core";
	import { pinLabel, tileLayers } from "@okmaps/core";
	import type * as Leaflet from "leaflet";
	import type { MapState } from "../../data/state.svelte";

	interface Props {
		state: MapState;
		width: number;
		height: number;
	}

	let { state: map, width, height }: Props = $props();

	let container: HTMLDivElement;
	let L: typeof Leaflet | null = $state.raw(null);
	let leaflet: Leaflet.Map | null = $state.raw(null);
	let failed = $state(false);

	$effect(() => {
		let gone = false;
		let created: Leaflet.Map | null = null;
		(async () => {
			try {
				const mod = await import("leaflet");
				await import("leaflet/dist/leaflet.css");
				if (gone) return;
				const lib = ((mod as { default?: typeof Leaflet }).default ?? mod) as typeof Leaflet;
				created = lib.map(container, {
					center: [45.1, 4.1],
					zoom: 2,
					minZoom: 2,
					maxZoom: 17,
					maxBounds: [
						[-85, -180],
						[85, 180],
					],
					maxBoundsViscosity: 1,
					worldCopyJump: true,
					zoomControl: false,
				});
				const layers = tileLayers.map((spec) =>
					lib.tileLayer(spec.url, { attribution: spec.attribution, maxZoom: 17 }),
				);
				layers[0].addTo(created);
				if (map.config.geomapZoomControl) lib.control.zoom({ position: "topleft" }).addTo(created);
				if (map.config.geomapLayerSwitcher) {
					lib.control
						.layers(Object.fromEntries(tileLayers.map((spec, i) => [spec.name, layers[i]])), undefined, {
							position: "topleft",
						})
						.addTo(created);
				}
				created.on("click", () => map.deselectPaper());
				L = lib;
				leaflet = created;
			} catch {
				failed = true;
			}
		})();
		return () => {
			gone = true;
			created?.remove();
			leaflet = null;
		};
	});

	// The map keeps up with the space it is given.
	$effect(() => {
		void width;
		void height;
		leaflet?.invalidateSize();
	});

	const pinned = $derived(
		map.map.papers.filter(
			(p) => map.matching.has(p.safeId) && p.place?.north !== null && p.place?.east !== null && !!p.place,
		),
	);

	function pick(paper: Paper) {
		map.selectPaper(paper.safeId);
	}

	$effect(() => {
		if (!L || !leaflet) return;
		const lib = L;
		const group = lib.layerGroup().addTo(leaflet);
		for (const paper of pinned) {
			const active = map.selectedPaper === paper.safeId || map.hoveredPaper === paper.safeId;
			const marker = lib.marker([paper.place?.north ?? 0, paper.place?.east ?? 0], {
				icon: lib.divIcon({
					className: `okm-pin${active ? " active" : ""}`,
					html: "",
					iconSize: [22, 30],
					iconAnchor: [11, 30],
				}),
				keyboard: true,
				zIndexOffset: active ? 1000 : 0,
			});
			marker.on("click", (e) => {
				lib.DomEvent.stopPropagation(e);
				pick(paper);
			});
			marker.on("add", () => {
				const el = marker.getElement();
				if (!el) return;
				el.setAttribute("role", "button");
				el.setAttribute("aria-label", pinLabel(paper.title, paper.place));
				el.setAttribute("aria-pressed", String(map.selectedPaper === paper.safeId));
				el.dataset.id = paper.safeId;
				el.addEventListener("keydown", (e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						pick(paper);
					}
				});
			});
			marker.addTo(group);
		}
		return () => group.remove();
	});

	// A resource picked in the list: bring its pin into view.
	$effect(() => {
		const paper = map.selectedPaper ? pinned.find((p) => p.safeId === map.selectedPaper) : undefined;
		if (!leaflet || !paper?.place?.north || !paper.place.east) return;
		const at: [number, number] = [paper.place.north, paper.place.east];
		if (!leaflet.getBounds().contains(at)) leaflet.panTo(at);
	});
</script>

<div class="okm-geomap" style:width="{width}px" style:height="{height}px">
	<div class="leaflet-host" bind:this={container}></div>
	{#if failed}
		<p class="failed">The map could not be loaded.</p>
	{/if}
</div>

<style>
	.okm-geomap {
		position: relative;
	}

	.leaflet-host {
		position: absolute;
		inset: 0;
		z-index: 0;
		font-family: var(--font-sans);
	}

	.failed {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		margin: 0;
		color: var(--color-text-muted);
	}

	/* Pins are Leaflet's elements, outside this component's markup. */
	.okm-geomap :global(.okm-pin) {
		cursor: pointer;
	}

	.okm-geomap :global(.okm-pin::before) {
		content: "";
		position: absolute;
		left: 2px;
		top: 0;
		width: 18px;
		height: 18px;
		border: 2px solid var(--color-surface);
		border-radius: 50% 50% 50% 0;
		background: var(--color-accent);
		box-shadow: var(--shadow-raised);
		transform: translateY(2px) rotate(-45deg);
		transform-origin: center;
	}

	.okm-geomap :global(.okm-pin.active::before) {
		background: var(--color-action);
	}

	.okm-geomap :global(.okm-pin:focus-visible) {
		outline: 2px solid var(--color-focus);
		outline-offset: 2px;
	}
</style>
