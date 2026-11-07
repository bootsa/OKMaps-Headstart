<!--
  @component
  "Move to…": pick a store and folder for a map. Lists every store's top
  folder and the folders the explorer has read so far. Works with touch and
  the keyboard, where dragging does not.
-->
<script lang="ts">
	import { untrack } from "svelte";
	import Button from "../components/Button.svelte";
	import Dialog from "../components/Dialog.svelte";
	import type { DraggedMap } from "./dnd";
	import { type ExplorerState, placeKey } from "./state.svelte";

	interface Props {
		explorer: ExplorerState;
		/** The map to move; the dialog is open while there is one. */
		map: DraggedMap | null;
	}

	let { explorer, map = $bindable() }: Props = $props();

	let open = $state(false);
	let choice = $state("");
	let busy = $state(false);

	// Opening a store can mean logging in, so only folders already read are offered.
	$effect(() => {
		const m = map;
		untrack(() => {
			open = !!m;
			if (m) choice = placeKey(m.store, m.path);
		});
	});

	interface Place {
		key: string;
		store: string;
		path: string[];
		label: string;
		depth: number;
	}

	const places = $derived.by(() => {
		const out: Place[] = [];
		const walk = (store: string, path: string[], depth: number) => {
			for (const name of explorer.listing(store, path)?.folders ?? []) {
				const sub = [...path, name];
				out.push({ key: placeKey(store, sub), store, path: sub, label: name, depth });
				walk(store, sub, depth + 1);
			}
		};
		for (const s of explorer.settings.stores) {
			out.push({ key: placeKey(s.id, []), store: s.id, path: [], label: s.name, depth: 0 });
			walk(s.id, [], 1);
		}
		return out;
	});

	async function move(e: SubmitEvent) {
		e.preventDefault();
		const to = places.find((p) => p.key === choice);
		if (!map || !to) return;
		busy = true;
		const ok = await explorer.moveMap(map, { store: to.store, path: to.path }, map.title);
		busy = false;
		if (ok) map = null;
	}
</script>

<Dialog bind:open title={map ? `Move ${map.title}` : "Move"} size="sm" onclose={() => (map = null)}>
	<form id="okm-move-form" onsubmit={move}>
		<fieldset>
			<legend>To</legend>
			{#each places as p (p.key)}
				<label style:padding-left="{p.depth * 1.25}rem" class:store={p.depth === 0}>
					<input type="radio" name="to" value={p.key} bind:group={choice}>
					{p.depth ? "📁 " : ""}{p.label}
				</label>
			{/each}
		</fieldset>
		<p class="hint">Open a store or folder in the list to offer the folders in it here.</p>
	</form>
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (map = null)}>Cancel</Button>
		<Button type="submit" form="okm-move-form" disabled={busy}>Move</Button>
	{/snippet}
</Dialog>

<style>
	fieldset {
		margin: 0;
		padding: 0;
		border: 0;
	}

	legend {
		margin-bottom: var(--space-2);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
	}

	label {
		display: flex;
		gap: var(--space-2);
		align-items: center;
		padding: var(--space-1) 0;
	}

	.store {
		font-weight: var(--font-weight-semibold);
	}

	.hint {
		margin: var(--space-3) 0 0;
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}
</style>
