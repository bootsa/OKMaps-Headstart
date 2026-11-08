<!--
  @component
  The person's maps in a vertical drawer: each store is a section that
  opens like an accordion, with its folders and maps. Folders can be made,
  renamed and deleted where the store allows them; maps can be deleted, and
  moved between folders and stores by dragging them or with "Move". Each
  store's maps can be exported to a file, and a file imported into it.
-->
<script lang="ts">
	import type { MapStore } from "@okmaps/storage";
	import { onMount } from "svelte";
	import { getStoreType, type StoreInstance } from "../settings/registry";
	import type { AppSettings } from "../settings/settings.svelte";
	import { type DraggedMap, dropTarget } from "./dnd";
	import FolderView from "./FolderView.svelte";
	import MoveDialog from "./MoveDialog.svelte";
	import { ExplorerState, type MapRef } from "./state.svelte";

	interface Props {
		settings: AppSettings;
		/** Whether the drawer is open. */
		open?: boolean;
		/** The map page's link to a map. */
		mapHref: (store: string, path: readonly string[], id: string) => string;
		/** Opens a store (default: with its registered type). */
		openStore?: (instance: StoreInstance) => Promise<MapStore>;
		serviceLabel?: (service: string) => string;
		/** Called when a map link is followed (e.g. to fetch it first). */
		onopenmap?: (e: MouseEvent, map: MapRef) => void;
		/** The settings page, for "Manage stores". */
		settingsHref?: string;
		/** Show a "Your maps" button that opens the drawer while it is closed. */
		toggle?: boolean;
		/** The explorer's state, to share it or to read it (tests, stories). */
		explorer?: ExplorerState;
	}

	let {
		settings,
		open = $bindable(true),
		mapHref,
		openStore,
		serviceLabel,
		onopenmap,
		settingsHref,
		toggle = true,
		explorer = $bindable(),
	}: Props = $props();

	// svelte-ignore state_referenced_locally
	const ex = explorer ?? new ExplorerState(settings, openStore);
	explorer = ex;
	let moving: DraggedMap | null = $state(null);
	let over: string | null = $state(null);

	const defaultId = $derived(settings.saveTo === "none" ? settings.stores[0]?.id : settings.saveTo.store);

	// The page can make room for the open drawer (on wide screens).
	$effect(() => {
		document.body.classList.toggle("okm-explorer-open", open);
		return () => document.body.classList.remove("okm-explorer-open");
	});

	function onkeydown(e: KeyboardEvent) {
		if (open && e.key === "Escape" && !document.querySelector("dialog[open]")) open = false;
	}

	onMount(() => {
		// The store new maps go to starts open.
		if (defaultId) void ex.toggle(defaultId, [], true);
	});

	const dropOn = (store: string) =>
		dropTarget(
			(map) => ex.moveMap(map, { store, path: [] }, map.title),
			(on) => (over = on ? store : over === store ? null : over),
		);

	async function exportStore(store: string) {
		const file = await ex.exportMaps(store);
		if (!file) return;
		const url = URL.createObjectURL(new Blob([file.text], { type: "application/json" }));
		const a = document.createElement("a");
		a.href = url;
		a.download = file.name;
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 0);
	}

	async function importInto(store: string, e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) await ex.importMaps(store, [], file);
		input.value = "";
	}

	/** Refreshes every open folder (after another page changed something). */
	export function refresh() {
		for (const s of settings.stores) if (ex.isExpanded(s.id, [])) void ex.load(s.id, []);
	}
</script>

<svelte:window {onkeydown} />

{#if toggle && !open}
	<button
		type="button"
		class="okm-explorer-toggle"
		aria-controls="okm-explorer"
		aria-expanded="false"
		onclick={() => (open = true)}
	>
		<span aria-hidden="true">☰</span>
		Your maps
	</button>
{/if}

<aside class="okm-explorer" class:open aria-label="Your maps" id="okm-explorer">
	<header>
		<h2>Your maps</h2>
		<button type="button" class="close" aria-label="Close your maps" onclick={() => (open = false)}>×</button>
	</header>
	<div class="stores">
		{#each settings.stores as s (s.id)}
			{@const type = getStoreType(s.type)}
			{@const expanded = ex.isExpanded(s.id, [])}
			<section class="store">
				<h3 class:over={over === s.id} {...dropOn(s.id)}>
					<button type="button" aria-expanded={expanded} onclick={() => ex.toggle(s.id, [])}>
						<span class="chevron" aria-hidden="true">{expanded ? "▾" : "▸"}</span>
						<span class="name">{s.name}</span>
						{#if s.id === defaultId}
							<span class="badge">Default</span>
						{/if}
					</button>
				</h3>
				{#if expanded}
					<div class="body">
						{#if type}
							<FolderView
								explorer={ex}
								store={s.id}
								path={[]}
								folders={type.folders}
								{mapHref}
								{serviceLabel}
								{onopenmap}
								onmove={(m) => (moving = m)}
							/>
							<div class="exchange">
								<button type="button" class="tool" onclick={() => exportStore(s.id)}>Export maps</button>
								<label class="tool">
									Import maps
									<input
										class="file"
										type="file"
										accept=".json,application/json"
										aria-label="Import maps into {s.name}"
										onchange={(e) => importInto(s.id, e)}
									>
								</label>
							</div>
						{:else}
							<p class="quiet">This site does not offer {s.type} stores.</p>
						{/if}
					</div>
				{/if}
			</section>
		{:else}
			<p class="quiet">There is no place to keep maps yet.</p>
		{/each}
	</div>
	<footer>
		<p class="status" class:error={ex.messageError} role="status" aria-live="polite">{ex.message}</p>
		{#if settingsHref}
			<a href={settingsHref}>Manage where maps are kept</a>
		{/if}
	</footer>
</aside>

<MoveDialog explorer={ex} bind:map={moving} />

<style>
	.okm-explorer {
		position: fixed;
		inset: 0 auto 0 0;
		z-index: 20;
		display: flex;
		flex-direction: column;
		width: min(24rem, 92vw);
		border-right: 1px solid var(--color-border);
		font-family: var(--font-sans);
		color: var(--color-text);
		background: var(--color-surface);
		box-shadow: var(--shadow-overlay);
		transform: translateX(-100%);
		visibility: hidden;
		transition:
			transform var(--duration-fast) var(--ease-standard),
			visibility 0s var(--duration-fast);

		&.open {
			transform: none;
			visibility: visible;
			transition: transform var(--duration-fast) var(--ease-standard);
		}
	}

	.okm-explorer-toggle {
		position: fixed;
		top: var(--space-3);
		left: var(--space-3);
		z-index: 19;
		padding: var(--space-2) var(--space-4);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-pill);
		font: inherit;
		font-family: var(--font-sans);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text);
		background: var(--color-surface);
		box-shadow: var(--shadow-overlay);
		cursor: pointer;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-3) var(--space-4);
		border-bottom: 1px solid var(--color-border);
	}

	h2 {
		margin: 0;
		font-size: var(--font-size-lg);
		color: var(--color-heading);
	}

	.close {
		border: 0;
		font-size: var(--font-size-xl);
		line-height: 1;
		color: var(--color-text-muted);
		background: none;
		cursor: pointer;
	}

	.stores {
		flex: 1;
		overflow: auto;
		padding: var(--space-2);
	}

	.store + .store {
		border-top: 1px solid var(--color-border);
	}

	h3 {
		margin: 0;
		border-radius: var(--radius-sm);

		&.over {
			outline: 2px dashed var(--color-accent);
			background: var(--color-highlight);
		}

		& button {
			display: flex;
			gap: var(--space-2);
			align-items: center;
			width: 100%;
			padding: var(--space-2);
			border: 0;
			font: inherit;
			font-weight: var(--font-weight-semibold);
			text-align: left;
			color: var(--color-heading);
			background: none;
			cursor: pointer;
		}
	}

	.chevron {
		width: 1em;
		color: var(--color-text-muted);
	}

	.name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.badge {
		padding: 0 var(--space-2);
		border-radius: var(--radius-pill);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-regular);
		color: var(--color-action-text);
		background: var(--color-accent);
	}

	.body {
		padding: 0 0 var(--space-2) var(--space-2);
	}

	.exchange {
		display: flex;
		gap: var(--space-2);
		margin: var(--space-2) var(--space-2) 0;
	}

	.tool {
		position: relative;
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-pill);
		font: inherit;
		font-size: var(--font-size-xs);
		color: var(--color-text);
		background: var(--color-surface);
		cursor: pointer;

		&:hover {
			border-color: var(--color-text-muted);
		}

		&:focus-within {
			outline: 2px solid var(--color-accent);
			outline-offset: 2px;
		}
	}

	/* The file input stays focusable and clickable through its label. */
	.file {
		position: absolute;
		inset: 0;
		width: 100%;
		opacity: 0;
		cursor: pointer;
	}

	footer {
		padding: var(--space-2) var(--space-4) var(--space-3);
		border-top: 1px solid var(--color-border);
		font-size: var(--font-size-sm);

		& a {
			color: var(--color-link);
		}
	}

	.status {
		min-height: 1.25em;
		margin: 0 0 var(--space-1);

		&.error {
			color: var(--color-danger);
		}
	}

	.quiet {
		margin: var(--space-2);
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}
</style>
