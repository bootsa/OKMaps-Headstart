<script module lang="ts">
	import type { MapRecord } from "@okmaps/core";
	import { defineMeta } from "@storybook/addon-svelte-csf";
	import base from "../../test/fixtures/base-map.json";
	import { MapState } from "../data/state.svelte";
	import Header from "./Header.svelte";

	const { Story } = defineMeta({
		title: "Components/Header",
		component: Header,
		tags: ["autodocs"],
	});

	const record = base as unknown as MapRecord;
	const withParams = (params: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
		new MapState({ ...record, context: { ...record.context, ...extra, params } }, 600);
</script>

<Story
	name="BASE search"
	args={{
		state: withParams({
			from: "2000-01-01",
			to: "2026-11-07",
			sorting: "most-relevant",
			document_types: ["121", "13", "F"],
		}),
	}}
/>
<Story
	name="Custom title"
	args={{ state: withParams({ sorting: "most-recent" }, { custom_title: "Dyes and stuff" }) }}
/>
<Story name="Shared map without search details" args={{ state: new MapState(record, 600) }} />
