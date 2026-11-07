<script module lang="ts">
	import { defineMeta } from "@storybook/addon-svelte-csf";
	import base from "../../../test/fixtures/base-map.json";
	import { MapState } from "../../data/state.svelte";
	import type { MapRecord } from "../../data/types";
	import KnowledgeMap from "./KnowledgeMap.svelte";

	const { Story } = defineMeta({
		title: "Views/Knowledge map",
		component: KnowledgeMap,
		tags: ["autodocs"],
		parameters: { layout: "centered" },
	});

	const record = base as unknown as MapRecord;

	/** A BASE map of 60 papers in its overview. */
	const overview = () => new MapState(record, 600);

	/** The same map zoomed into its largest area, with a paper selected. */
	function zoomed(theme = "labels") {
		const state = new MapState(record, 600);
		state.theme = theme;
		const area = [...state.map.areas].sort((a, b) => b.papers.length - a.papers.length)[0];
		state.selectPaper(area.papers[0].safeId);
		return state;
	}

	/** A shared map can carry any area title; it must show as text. */
	function crafted() {
		const rec = structuredClone(record);
		const uri = rec.documents[0].area_uri;
		for (const d of rec.documents) if (d.area_uri === uri) d.area = '<img src=x onerror="alert(1)"> <b>Bold</b> title';
		return new MapState(rec, 600);
	}
</script>

<Story name="Overview" args={{ state: overview() }} />
<Story name="Zoomed in" args={{ state: zoomed() }} />
<Story name="Original theme" args={{ state: Object.assign(overview(), { theme: "original" }) }} />
<Story name="Original theme, zoomed in" args={{ state: zoomed("original") }} />
<Story name="Octagons theme, zoomed in" args={{ state: zoomed("octagons") }} />
<Story name="Searching" args={{ state: Object.assign(overview(), { search: "water" }) }} />
<Story name="Crafted area title" args={{ state: crafted() }} />
