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
</script>

<Story name="Knowledge map with list" args={{ state: new MapState(base as unknown as MapRecord, 600), height: 640 }} />
