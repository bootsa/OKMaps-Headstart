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
		/** Offer "Full height" / "Fit to screen" (not when the list sits in a drawer). */
		fitToggle?: boolean;
		/** Shows a close button that calls this (the list in a drawer). */
		onclose?: () => void;
	}

	let { state: map, debounce = 300, fitToggle = true, onclose }: Props = $props();

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
	const heading = $derived(map.selectedStream ?? map.area?.title ?? "Overview");
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
	// Shortcuts to the map's areas or streams, on the overview only.
	const sections = $derived(map.view.sections);
	const overview = $derived(map.zoomedArea === null && map.selectedStream === null && map.selectedPaper === null);
	const parts = $derived(sections && overview ? sections.list(map) : []);
	function leave() {
		sections?.hover?.(map, null);
	}
	const options = (ids: string[]) => ids.map((id) => ({ id, label: capitalize(t(s, id)) }));
</script>

<section class="okm-list" class:fit={map.listFit} aria-label="Resources">
	<div class="header">
		<!-- The back button floats above the title when they do not fit side by side. -->
		<div class="lead">
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
			{:else if map.selectedStream !== null}
				<Button variant="secondary" size="sm" onclick={() => map.selectStream(null)}
					>{t(s, "backlink_list_streamgraph_stream_selected")}</Button
				>
			{/if}
		</div>
		{#if onclose}
			<button type="button" class="close" aria-label="Close the list" title="Close the list" onclick={onclose}>
				×
			</button>
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
					<Button variant="secondary" size="sm" onclick={() => map.deselectPaper()}
						>{t(s, map.view.strings.backlink)}</Button
					>
				{/if}
				{#if fitToggle}
					<button
						type="button"
						class="fit-toggle"
						aria-pressed={!map.listFit}
						title={map.listFit
							? "Show the whole list; the page scrolls"
							: "Fit the list to the screen; the list scrolls"}
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
				{/if}
			</div>
		</div>

		{#if sections && parts.length > 0}
			<details class="sections" bind:open={map.sectionsOpen}>
				<summary>{t(s, sections.label)} ({parts.length})</summary>
				<ul>
					{#each parts as part (part.id)}
						<li>
							<button
								type="button"
								class:none={part.count === 0}
								title={part.label}
								onclick={() => {
									leave();
									sections.open(map, part.id);
								}}
								onpointerenter={() => sections.hover?.(map, part.id)}
								onpointerleave={leave}
								onfocus={() => sections.hover?.(map, part.id)}
								onblur={leave}
							>
								<span class="label">{part.label}</span>
								<span class="n">{part.count}</span>
							</button>
						</li>
					{/each}
				</ul>
			</details>
		{/if}

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

	/* wrap-reverse: when the title and the back button do not fit on one row,
	   the button moves to its own row above the title, which keeps the full width. */
	.lead {
		display: flex;
		flex: 1;
		flex-wrap: wrap-reverse;
		align-items: center;
		gap: var(--space-1) var(--space-2);
		min-width: 0;

		> :global(button:not(.toggle)) {
			max-width: 100%;
		}
	}

	.toggle {
		display: flex;
		flex: 1 1 12rem;
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

	.close {
		flex: none;
		width: 2rem;
		height: 2rem;
		margin-top: -2px;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: none;
		color: var(--color-text);
		font-size: 1.5rem;
		line-height: 1;
		cursor: pointer;

		&:hover {
			background: var(--color-surface);
		}

		&:focus-visible {
			outline: 2px solid var(--color-focus);
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

	.sections {
		flex: none;
		padding: var(--space-2) var(--space-4);
		background: var(--color-surface-muted);
		border-bottom: 1px solid var(--color-border);
		font-size: var(--font-size-xs);
		color: var(--color-text);

		summary {
			width: fit-content;
			font-weight: var(--font-weight-semibold);
			cursor: pointer;

			&:focus-visible {
				outline: 2px solid var(--color-focus);
			}
		}

		/* A few rows at most, so the entries keep the room on a phone. Long
		   names must not widen the list (contain), they are cut instead. */
		ul {
			contain: inline-size;
			display: flex;
			flex-wrap: wrap;
			gap: var(--space-1);
			max-height: 6.5rem;
			margin: var(--space-2) 0 0;
			padding: 0;
			overflow-y: auto;
			list-style: none;
		}

		li {
			min-width: 0;
			max-width: 100%;
		}

		button {
			display: inline-flex;
			align-items: baseline;
			gap: var(--space-1);
			max-width: 100%;
			padding: 2px var(--space-2);
			border: 1px solid var(--color-border);
			border-radius: var(--radius-pill);
			background: var(--color-surface);
			color: var(--color-text);
			font: inherit;
			cursor: pointer;

			&:hover {
				border-color: var(--color-accent);
			}

			&:focus-visible {
				outline: 2px solid var(--color-focus);
			}

			&.none {
				opacity: 0.55;
			}
		}

		.label {
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.n {
			color: var(--color-text-muted);
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
