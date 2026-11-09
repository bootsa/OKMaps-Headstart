<script module lang="ts">
	import type { MapRecord } from "@okmaps/core";
	import { defineMeta } from "@storybook/addon-svelte-csf";
	import base from "../../test/fixtures/base-map.json";
	import { MapState } from "../data/state.svelte";
	import List from "./List.svelte";

	const { Story } = defineMeta({
		title: "Components/List",
		component: List,
		tags: ["autodocs"],
	});

	const record = base as unknown as MapRecord;
	const state = () => new MapState(record, 600);

	function selected() {
		const s = state();
		s.selectPaper(s.map.papers[3].safeId);
		return s;
	}
</script>

<Story name="Overview" args={{ state: state() }} />
<Story name="Paper selected" args={{ state: selected() }} />
<Story name="Searching" args={{ state: Object.assign(state(), { search: "water" }) }} />
