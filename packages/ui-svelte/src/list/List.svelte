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

	const heading = $derived(map.zoomedArea === null ? "Overview" : t(s, "area"));
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

<section class="okm-list" aria-label="Resources">
	<button
		type="button"
		class="toggle"
		aria-expanded={map.listVisible}
		title={map.listVisible ? "Hide list" : "Show list"}
		onclick={() => (map.listVisible = !map.listVisible)}
	>
		<span class="chevron" aria-hidden="true">▾</span>
		<span>{heading} (<span class="count">{papers.length}</span> {docsLabel})</span>
		<span class="chevron" aria-hidden="true">▾</span>
	</button>

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
			{#if map.selectedPaper}
				<Button variant="secondary" size="sm" onclick={() => map.deselectPaper()}>{t(s, "backlink_list")}</Button>
			{:else if map.zoomedArea !== null}
				<Button variant="secondary" size="sm" onclick={() => map.zoomOut()}>{t(s, "backlink")}</Button>
			{/if}
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

	.toggle {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4);
		border: 0;
		background: var(--color-surface-muted);
		color: var(--color-text);
		font: inherit;
		font-size: var(--font-size-sm);
		cursor: pointer;

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
