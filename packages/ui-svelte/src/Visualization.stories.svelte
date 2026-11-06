<script module lang="ts">
	import { defineMeta } from "@storybook/addon-svelte-csf";
	import base from "../test/fixtures/base-map.json";
	import { MapState } from "./data/state.svelte";
	import type { MapRecord } from "./data/types";
	import Visualization from "./Visualization.svelte";

	const { Story } = defineMeta({
		title: "Views/Visualization",
		component: Visualization,
		parameters: { layout: "fullscreen" },
	});

	// Built here, not passed as an arg: Storybook copies args, and a copy of
	// the state no longer updates the page.
	const state = new MapState(base as unknown as MapRecord, 600);
</script>

<Story name="Knowledge map with list">
	{#snippet template()}
		<Visualization {state} />
	{/snippet}
</Story>
