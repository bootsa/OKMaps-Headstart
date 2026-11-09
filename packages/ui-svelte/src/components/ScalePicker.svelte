<!--
  @component
  "Scale map by": what the papers and areas are sized by (documents,
  citations, social media mentions, ...), with a sentence on what the
  sizes mean. Shown only when the map offers choices.
-->
<script lang="ts">
	import { t } from "@okmaps/core";
	import type { MapState } from "../data/state.svelte";

	let { state: map }: { state: MapState } = $props();

	const s = $derived(map.strings);
	const labels = $derived((typeof s.scale_label === "object" ? s.scale_label : {}) as Record<string, string>);
	const explanation = $derived(map.scaleBy ? (map.config.scaleExplanations[map.scaleBy] ?? "") : "");
	const id = $props.id();
</script>

{#if map.config.scaleOptions.length}
	<div class="okm-scale-picker">
		<label>
			<span>{t(s, "scale_by_label").replace(/:\s*$/, "")}</span>
			<select
				value={map.scaleBy}
				aria-describedby={explanation ? `${id}-why` : undefined}
				onchange={(e) => map.scale(e.currentTarget.value)}
			>
				{#each map.config.scaleOptions as option (option)}
					<option value={option}>{labels[option] ?? option}</option>
				{/each}
			</select>
		</label>
		{#if explanation}
			<p id="{id}-why">{explanation}</p>
		{/if}
	</div>
{/if}

<style>
	.okm-scale-picker {
		color: var(--color-text-muted);
		font-family: var(--font-sans);
		font-size: var(--font-size-sm);
	}

	label {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}

	select {
		padding: 2px var(--space-1);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
		color: var(--color-text);
		font: inherit;
	}

	p {
		max-width: 18rem;
		margin: var(--space-1) 0 0;
		font-size: var(--font-size-xs);
	}
</style>
