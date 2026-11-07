<!--
  @component
  The map's title and context line: what was searched, how many resources
  the map holds, the time span, data quality and so on, plus any context
  items from plugins. All text, never HTML.
-->
<script lang="ts">
	import Tooltip from "../components/Tooltip.svelte";
	import type { MapState } from "../data/state.svelte";
	import { activePlugins } from "../plugins";
	import { contextItems, mapTitle } from "./context";

	let { state: map }: { state: MapState } = $props();

	const title = $derived(mapTitle(map.config, map.map.context, map.strings));
	const items = $derived([
		...contextItems(map.config, map.map.context, map.map.papers, map.strings),
		...activePlugins().flatMap((p) => p.contextItems?.(map) ?? []),
	]);
</script>

<header class="okm-header">
	<h1 class="title">
		{#if title.kind === "basic"}
			{title.text}
		{:else if title.kind === "standard"}
			{title.label} <span class="query" title={title.full}>{title.text}</span>
		{:else if title.kind === "custom"}
			{title.label} <span class="query" title={title.tooltip}>{title.text}</span>
		{:else}
			Overview of <span class="query" title={title.full}>{title.text}</span>
			{#if title.projectId}
				<span class="project-id">({title.projectId})</span>
			{/if}
		{/if}
	</h1>
	{#if items.length}
		<p class="context">
			{#each items as item (item.id)}
				<span class="item" data-item={item.id}>
					{#if item.tooltip}
						<Tooltip tip={item.tooltip}>{item.text}</Tooltip>
					{:else}
						{item.text}
					{/if}
				</span>
			{/each}
		</p>
	{/if}
</header>

<style>
	.okm-header {
		min-width: 0;
		color: var(--color-text);
		font-family: var(--font-sans);
	}

	.title {
		margin: 0;
		color: var(--color-heading);
		font-size: var(--font-size-xl);
		font-weight: var(--font-weight-regular);
		line-height: var(--line-height-tight);
		overflow-wrap: anywhere;
	}

	.query {
		font-weight: var(--font-weight-bold);
	}

	.project-id {
		color: var(--color-text-muted);
		font-size: var(--font-size-md);
	}

	.context {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-4);
		margin: var(--space-2) 0 0;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
</style>
