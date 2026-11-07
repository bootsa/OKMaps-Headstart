<!--
  @component
  The info page of a geo map (old StandardGeomapInfo): what it gives an
  overview of, the query behind a custom title, and the software.
-->
<script lang="ts">
	import type { MapState } from "../../data/state.svelte";
	import AboutSoftware from "../../plugins/core/info/AboutSoftware.svelte";

	let { state: map }: { state: MapState } = $props();

	const query = $derived(
		[map.map.context.query, map.map.context.q_advanced].filter((q) => typeof q === "string" && q).join(" "),
	);
	const params = $derived(map.map.context.params);
	const customTitle = $derived.by(() => {
		if (map.config.customTitle) return map.config.customTitle;
		if (typeof map.map.context.custom_title === "string") return map.map.context.custom_title;
		try {
			const p = typeof params === "string" ? JSON.parse(params) : params;
			return typeof p?.custom_title === "string" ? p.custom_title : null;
		} catch {
			return null;
		}
	});
</script>

<p>This geo map presents you with an overview of <strong>{customTitle ?? query}</strong>.</p>
{#if query && customTitle}
	<p>This visualization has a custom title and was created using the following query: <strong>{query}</strong></p>
{/if}
<AboutSoftware />
