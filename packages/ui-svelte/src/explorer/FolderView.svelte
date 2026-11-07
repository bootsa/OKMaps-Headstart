<!--
  @component
  One folder in the map explorer: its subfolders (each expandable, a drop
  target for maps) and its maps (each draggable, with Move to… and Delete),
  plus New folder where the store can hold folders.
-->
<script lang="ts">
	import type { MapSummary } from "@okmaps/storage";
	import { getStoreType } from "../settings/registry";
	import { type DraggedMap, dropTarget, startDrag } from "./dnd";
	import FolderView from "./FolderView.svelte";
	import type { ExplorerState, MapRef } from "./state.svelte";

	interface Props {
		explorer: ExplorerState;
		store: string;
		path: string[];
		/** Whether the store can hold folders. */
		folders: boolean;
		mapHref: (store: string, path: readonly string[], id: string) => string;
		serviceLabel?: (service: string) => string;
		onmove: (map: DraggedMap) => void;
		onopenmap?: (e: MouseEvent, map: MapRef) => void;
	}

	let { explorer, store, path, folders, mapHref, serviceLabel = (s) => s, onmove, onopenmap }: Props = $props();

	const listing = $derived(explorer.listing(store, path));
	const instance = $derived(explorer.settings.store(store));
	const type = $derived(instance ? getStoreType(instance.type) : undefined);
	let over: string | null = $state(null);
	let adding = $state(false);
	let newName = $state("");
	let renaming: string | null = $state(null);
	let renameTo = $state("");
	let confirming: string | null = $state(null);

	const drop = (name: string) =>
		dropTarget(
			(map) => explorer.moveMap(map, { store, path: [...path, name] }, map.title),
			(on) => (over = on ? name : over === name ? null : over),
		);

	async function add(e: SubmitEvent) {
		e.preventDefault();
		if (await explorer.createFolder(store, path, newName)) {
			adding = false;
			newName = "";
		}
	}

	async function rename(e: SubmitEvent, from: string) {
		e.preventDefault();
		if (await explorer.renameFolder(store, path, from, renameTo)) renaming = null;
	}

	const meta = (m: MapSummary) =>
		[serviceLabel(m.service), `${m.documents} documents`, new Date(m.created).toLocaleDateString()].join(" · ");
</script>

{#if listing?.status === "error"}
	<p class="problem">
		Could not be read: {listing.error instanceof Error ? listing.error.message : String(listing.error)}.
		{#if instance && type?.reconnect && (listing.error as { status?: number })?.status === 401}
			<button type="button" class="link" onclick={() => type.reconnect?.(instance)}>Log in again</button>
		{:else}
			<button type="button" class="link" onclick={() => explorer.load(store, path)}>Try again</button>
		{/if}
	</p>
{:else if !listing || (listing.status === "loading" && !listing.folders.length && !listing.maps.length)}
	<p class="quiet">Reading…</p>
{:else}
	<ul class="items" role="group">
		{#each listing.folders as name (name)}
			{@const sub = [...path, name]}
			{@const open = explorer.isExpanded(store, sub)}
			<li class="folder">
				{#if renaming === name}
					<form class="inline" onsubmit={(e) => rename(e, name)}>
						<label class="sr-only" for="okm-rename-{store}-{sub.join("-")}">New name for {name}</label>
						<!-- svelte-ignore a11y_autofocus -->
						<input id="okm-rename-{store}-{sub.join("-")}" bind:value={renameTo} required autofocus>
						<button type="submit" class="small">Rename</button>
						<button type="button" class="small ghost" onclick={() => (renaming = null)}>Cancel</button>
					</form>
				{:else}
					<div class="row" class:over={over === name} {...drop(name)}>
						<button type="button" class="toggle" aria-expanded={open} onclick={() => explorer.toggle(store, sub)}>
							<span class="chevron" aria-hidden="true">{open ? "▾" : "▸"}</span>
							<span class="icon" aria-hidden="true">📁</span>
							<span class="name">{name}</span>
						</button>
						<span class="actions">
							<button
								type="button"
								class="small ghost"
								aria-label="Rename folder {name}"
								onclick={() => {
									renaming = name;
									renameTo = name;
								}}
							>
								Rename
							</button>
							<button
								type="button"
								class="small ghost"
								aria-label="Delete folder {name}"
								onclick={() => (confirming = `f:${name}`)}
							>
								Delete
							</button>
						</span>
					</div>
					{#if confirming === `f:${name}`}
						<div class="confirm" role="alert">
							Delete {name} and every map in it?
							<button type="button" class="small danger" onclick={() => explorer.deleteFolder(store, path, name)}>
								Delete
							</button>
							<button type="button" class="small ghost" onclick={() => (confirming = null)}>Keep</button>
						</div>
					{/if}
				{/if}
				{#if open}
					<div class="nested">
						<FolderView {explorer} {store} path={sub} {folders} {mapHref} {serviceLabel} {onmove} {onopenmap} />
					</div>
				{/if}
			</li>
		{/each}
		{#each listing.maps as m (m.id)}
			{@const ref = { store, path, id: m.id }}
			<li class="map">
				<div class="row">
					<a
						href={mapHref(store, path, m.id)}
						draggable="true"
						ondragstart={(e) => startDrag(e, { ...ref, title: m.title })}
						onclick={(e) => onopenmap?.(e, ref)}
					>
						<span class="title">{m.title}</span>
						<span class="meta">{meta(m)}</span>
					</a>
					<span class="actions">
						<button
							type="button"
							class="small ghost"
							aria-label="Move map {m.title}"
							onclick={() => onmove({ ...ref, title: m.title })}
						>
							Move
						</button>
						<button
							type="button"
							class="small ghost"
							aria-label="Delete map {m.title}"
							onclick={() => (confirming = `m:${m.id}`)}
						>
							Delete
						</button>
					</span>
				</div>
				{#if confirming === `m:${m.id}`}
					<div class="confirm" role="alert">
						Delete {m.title}?
						<button type="button" class="small danger" onclick={() => explorer.deleteMap(ref, m.title)}>Delete</button>
						<button type="button" class="small ghost" onclick={() => (confirming = null)}>Keep</button>
					</div>
				{/if}
			</li>
		{/each}
		{#if !listing.folders.length && !listing.maps.length}
			<li class="quiet">{path.length ? "This folder is empty." : "No maps yet."}</li>
		{/if}
	</ul>
	{#if folders}
		{#if adding}
			<form class="inline" onsubmit={add}>
				<label class="sr-only" for="okm-new-{store}-{path.join("-")}">Folder name</label>
				<!-- svelte-ignore a11y_autofocus -->
				<input id="okm-new-{store}-{path.join("-")}" bind:value={newName} required placeholder="Folder name" autofocus>
				<button type="submit" class="small">Make</button>
				<button type="button" class="small ghost" onclick={() => (adding = false)}>Cancel</button>
			</form>
		{:else}
			<button type="button" class="small ghost add" onclick={() => (adding = true)}>+ New folder</button>
		{/if}
	{/if}
{/if}

<style>
	.items {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.row {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		min-height: 2.25rem;
		border-radius: var(--radius-sm);

		&:hover,
		&:focus-within {
			background: var(--color-surface-muted);
		}

		&.over {
			outline: 2px dashed var(--color-accent);
			background: var(--color-highlight);
		}
	}

	.toggle,
	.row a {
		display: flex;
		flex: 1;
		min-width: 0;
		gap: var(--space-2);
		align-items: baseline;
		padding: var(--space-1) var(--space-2);
		border: 0;
		font: inherit;
		text-align: left;
		color: var(--color-text);
		background: none;
		cursor: pointer;
	}

	.row a {
		flex-direction: column;
		gap: 0;
		text-decoration: none;
	}

	.chevron {
		width: 1em;
		color: var(--color-text-muted);
	}

	.name,
	.title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.title {
		max-width: 100%;
		font-weight: var(--font-weight-semibold);
	}

	.meta,
	.quiet {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	.quiet {
		margin: 0;
		padding: var(--space-1) var(--space-2);
	}

	.actions {
		display: flex;
		flex: none;
		opacity: 0.85;
	}

	.nested {
		margin-left: var(--space-4);
		padding-left: var(--space-2);
		border-left: 1px solid var(--color-border);
	}

	.small {
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--color-action);
		border-radius: var(--radius-pill);
		font: inherit;
		font-size: var(--font-size-xs);
		color: var(--color-action-text);
		background: var(--color-action);
		cursor: pointer;

		&.ghost {
			border-color: transparent;
			color: var(--color-text-muted);
			background: none;

			&:hover {
				color: var(--color-text);
			}
		}

		&.danger {
			border-color: var(--color-danger);
			background: var(--color-danger);
		}
	}

	.add {
		margin: var(--space-1) 0 var(--space-2);
	}

	.inline {
		display: flex;
		gap: var(--space-1);
		align-items: center;
		margin: var(--space-1) 0;

		& input {
			flex: 1;
			min-width: 0;
			padding: var(--space-1) var(--space-2);
			border: 1px solid var(--color-border);
			border-radius: var(--radius-sm);
			font: inherit;
			color: var(--color-text);
			background: var(--color-surface);
		}
	}

	.confirm {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		align-items: center;
		margin: var(--space-1) 0;
		padding: var(--space-2);
		border-radius: var(--radius-sm);
		font-size: var(--font-size-sm);
		background: var(--color-surface-muted);
	}

	.problem {
		margin: 0;
		padding: var(--space-1) var(--space-2);
		font-size: var(--font-size-sm);
		color: var(--color-danger);
	}

	.link {
		border: 0;
		padding: 0;
		font: inherit;
		text-decoration: underline;
		color: inherit;
		background: none;
		cursor: pointer;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
