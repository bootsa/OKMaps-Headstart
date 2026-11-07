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
	const record = base as unknown as MapRecord;
	const state = new MapState(
		{
			...record,
			context: {
				...record.context,
				params: { from: "2000-01-01", to: "2026-11-07", sorting: "most-relevant", document_types: ["121", "F"] },
			},
		},
		600,
	);
</script>

<Story name="Knowledge map with list">
	{#snippet template()}
		<Visualization {state} />
	{/snippet}
</Story>
