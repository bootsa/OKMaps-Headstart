<!--
  @component
  The map's title and context line: what was searched, how many resources
  the map holds, the time span, data quality and so on, plus any context
  items from plugins. All text, never HTML.
-->
<script lang="ts">
	import Button from "../components/Button.svelte";
	import Tooltip from "../components/Tooltip.svelte";
	import type { MapState } from "../data/state.svelte";
	import { t } from "../i18n/strings";
	import { activePlugins, findModal } from "../plugins";
	import { contextItems, mapTitle } from "./context";

	let { state: map }: { state: MapState } = $props();

	const title = $derived(mapTitle(map.config, map.map.context, map.strings));
	const items = $derived([
		...contextItems(map.config, map.map.context, map.map.papers, map.strings),
		...activePlugins().flatMap((p) => p.contextItems?.(map) ?? []),
	]);
	const actions = $derived(
		activePlugins()
			.flatMap((p) => p.actions ?? [])
			.filter((a) => a.show?.(map) ?? true),
	);
	const hasInfo = $derived(Boolean(findModal("info")));
</script>

<header class="okm-header">
	{#if actions.length}
		<div class="actions">
			{#each actions as action (action.id)}
				{#if action.href}
					<Button variant="secondary" size="sm" href={action.href(map)} newTab title={action.title}
						>{action.label}</Button
					>
				{:else}
					<Button variant="secondary" size="sm" title={action.title} onclick={() => action.run?.(map)}
						>{action.label}</Button
					>
				{/if}
			{/each}
		</div>
	{/if}
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
	{#if items.length || hasInfo}
		<p class="context">
			{#each items as item (item.id)}
				<span class="item" data-item={item.id}>
					{#if item.run}
						<button type="button" class="info" title={item.tooltip} onclick={item.run}>{item.text}</button>
					{:else if item.tooltip}
						<Tooltip tip={item.tooltip}>{item.text}</Tooltip>
					{:else}
						{item.text}
					{/if}
				</span>
			{/each}
			{#if hasInfo}
				<button type="button" class="info" onclick={() => map.openModal("info")}>
					{t(map.strings, "intro_label")}
				</button>
			{/if}
		</p>
	{/if}
</header>

<style>
	.okm-header {
		display: flow-root;
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

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		float: right;
		margin: 0 0 var(--space-2) var(--space-4);
	}

	.info {
		padding: 0;
		border: 0;
		background: none;
		color: var(--color-link);
		font: inherit;
		text-decoration: underline;
		text-underline-offset: 0.15em;
		cursor: pointer;
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
