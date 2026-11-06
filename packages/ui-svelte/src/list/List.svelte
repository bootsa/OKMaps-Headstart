<!--
  @component
  The paper list beside the map: a header with the number of resources (it
  shows and hides the list), search, filter and sort, then the entries. It
  follows the map: zooming into an area lists its papers, selecting a paper
  lists only that one.
-->
<script lang="ts">
	import { untrack } from "svelte";
	import Button from "../components/Button.svelte";
	import { listPapers } from "../data/filter";
	import type { MapState } from "../data/state.svelte";
	import { t } from "../i18n/strings";
	import { capitalize } from "./format";
	import ListEntry from "./ListEntry.svelte";

	interface Props {
		state: MapState;
		/** Search debounce in ms. */
		debounce?: number;
	}

	let { state: map, debounce = 300 }: Props = $props();

	const s = $derived(map.strings);
	const papers = $derived(map.listed);

	// The search box keeps its own text and updates the state after a pause.
	let text = $state(untrack(() => map.search));
	let timer: ReturnType<typeof setTimeout> | undefined;
	function oninput() {
		clearTimeout(timer);
		timer = setTimeout(() => (map.search = text), debounce);
	}
	function clear() {
		clearTimeout(timer);
		text = "";
		map.search = "";
	}

	// The zoomed area's name: the map hides it while zoomed in.
	const heading = $derived(map.area?.title ?? "Overview");
	const docsLabel = $derived.by(() => {
		const label =
			map.filter === "open_access" ? "open access resource" : map.filter === "dataset" ? "dataset" : "resource";
		return papers.length === 1 ? label : `${label}s`;
	});
	// Nothing in the list, nor among the area's papers: the filters hide everything.
	const empty = $derived(
		papers.length === 0 &&
			listPapers(map.map.papers, { search: map.search, filter: map.filter, sort: "", area: map.zoomedArea }).length ===
				0,
	);
	const options = (ids: string[]) => ids.map((id) => ({ id, label: capitalize(t(s, id)) }));
</script>

<section class="okm-list" class:fit={map.listFit} aria-label="Resources">
	<div class="header">
		<button
			type="button"
			class="toggle"
			aria-expanded={map.listVisible}
			title={map.listVisible ? "Hide list" : "Show list"}
			onclick={() => (map.listVisible = !map.listVisible)}
		>
			<span class="chevron" aria-hidden="true">▾</span>
			<span class="title">
				<span class="heading">{heading}</span>
				<span class="docs">(<span class="count">{papers.length}</span> {docsLabel})</span>
			</span>
		</button>
		{#if map.zoomedArea !== null}
			<Button variant="secondary" size="sm" onclick={() => map.zoomOut()}>{t(s, "backlink")}</Button>
		{/if}
	</div>

	{#if map.listVisible}
		<div class="controls">
			<div class="search">
				<input
					type="search"
					placeholder={t(s, "search_placeholder")}
					aria-label={t(s, "search_placeholder")}
					bind:value={text}
					{oninput}
				>
				{#if text}
					<button type="button" class="clear" aria-label="Clear search" onclick={clear}>×</button>
				{/if}
			</div>
			<div class="selects">
				{#if map.config.filterOptions.length > 1}
					<label>
						{t(s, "filter_by_label")}
						<select bind:value={map.filter}>
							{#each options(map.config.filterOptions) as o (o.id)}
								<option value={o.id}>{o.label}</option>
							{/each}
						</select>
					</label>
				{/if}
				{#if map.config.sortOptions.length > 1}
					<label>
						{t(s, "sort_by_label")}
						<select bind:value={map.sort}>
							{#each options(map.config.sortOptions) as o (o.id)}
								<option value={o.id}>{o.label}</option>
							{/each}
						</select>
					</label>
				{/if}
			</div>
			<div class="row">
				{#if map.selectedPaper}
					<Button variant="secondary" size="sm" onclick={() => map.deselectPaper()}>{t(s, "backlink_list")}</Button>
				{/if}
				<button
					type="button"
					class="fit-toggle"
					aria-pressed={!map.listFit}
					title={map.listFit ? "Show the whole list; the page scrolls" : "Fit the list to the screen; the list scrolls"}
					onclick={() => (map.listFit = !map.listFit)}
				>
					<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
						{#if map.listFit}
							<path d="M7 1v12M3 9l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" />
						{:else}
							<path d="M7 13V1M3 5l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.6" />
						{/if}
					</svg>
					{map.listFit ? "Full height" : "Fit to screen"}
				</button>
			</div>
		</div>

		<div class="entries">
			{#if empty}
				<p class="empty">{t(s, "empty_area_warning")}</p>
			{:else}
				{#each papers as paper (paper.safeId)}
					<ListEntry {paper} state={map} />
				{/each}
			{/if}
		</div>
	{/if}
</section>

<style>
	.okm-list {
		display: flex;
		flex-direction: column;
		min-height: 0;
		background: var(--color-surface);
		font-family: var(--font-sans);
	}

	.okm-list.fit {
		box-sizing: border-box;
		position: sticky;
		top: 0;
		max-height: 100dvh;
	}

	.header {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4) 0;
		background: var(--color-surface-muted);
	}

	.toggle {
		display: flex;
		flex: 1;
		align-items: baseline;
		gap: var(--space-2);
		min-width: 0;
		padding: var(--space-1) 0;
		border: 0;
		background: none;
		color: var(--color-text);
		font: inherit;
		font-size: var(--font-size-sm);
		text-align: start;
		cursor: pointer;

		.heading {
			font-weight: var(--font-weight-semibold);
			overflow-wrap: anywhere;
		}

		.title {
			min-width: 0;
		}

		.docs {
			white-space: nowrap;
			color: var(--color-text-muted);
		}

		&:focus-visible {
			outline: 2px solid var(--color-focus);
		}

		&[aria-expanded="false"] .chevron {
			transform: rotate(-90deg);
		}
	}

	.controls {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
		background: var(--color-surface-muted);
		border-bottom: 1px solid var(--color-border);
	}

	.search {
		position: relative;
		align-self: stretch;

		input {
			box-sizing: border-box;
			width: 100%;
			padding: var(--space-1) var(--space-6) var(--space-1) var(--space-3);
			border: 1px solid var(--color-border);
			border-radius: var(--radius-pill);
			font: inherit;
			font-size: var(--font-size-sm);
		}

		input::-webkit-search-cancel-button {
			display: none;
		}
	}

	.clear {
		position: absolute;
		inset-block: 0;
		right: var(--space-2);
		border: 0;
		background: none;
		color: var(--color-text-muted);
		font-size: var(--font-size-lg);
		cursor: pointer;
	}

	.row {
		display: flex;
		align-self: stretch;
		align-items: center;
		gap: var(--space-2);
	}

	.fit-toggle {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		margin-left: auto;
		padding: 2px var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-pill);
		background: var(--color-surface);
		color: var(--color-text);
		font: inherit;
		font-size: var(--font-size-xs);
		cursor: pointer;

		&:focus-visible {
			outline: 2px solid var(--color-focus);
		}
	}

	.selects {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		font-size: var(--font-size-xs);
		color: var(--color-text);

		select {
			margin-left: var(--space-1);
			padding: 2px var(--space-2);
			border: 1px solid var(--color-border);
			border-radius: var(--radius-pill);
			background: var(--color-surface);
			font: inherit;
		}
	}

	.entries {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}

	.empty {
		padding: var(--space-4);
		color: var(--color-text-muted);
	}
</style>
