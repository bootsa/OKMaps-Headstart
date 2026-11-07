<!--
  @component
  Picks the map theme. The pick is remembered in this browser; ?theme= in
  the page's URL wins when the page opens.
-->
<script lang="ts">
	import type { MapState } from "../../../data/state.svelte";
	import { mapThemes, saveTheme } from ".";

	let { state: map }: { state: MapState } = $props();
</script>

<label class="okm-theme-picker">
	<span>Map style</span>
	<select
		value={map.theme}
		onchange={(e) => {
			map.theme = e.currentTarget.value;
			saveTheme(map.theme);
		}}
	>
		{#each mapThemes() as theme (theme.id)}
			<option value={theme.id}>{theme.name}</option>
		{/each}
	</select>
</label>

<style>
	.okm-theme-picker {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--color-text-muted);
		font-family: var(--font-sans);
		font-size: var(--font-size-sm);
	}

	select {
		padding: 2px var(--space-1);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
		color: var(--color-text);
		font: inherit;
	}
</style>
