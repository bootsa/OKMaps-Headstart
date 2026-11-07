<!--
  @component
  Adds a store, or edits one: its type (when new), a name and the type's
  fields. "Check and save" connects to it first, so a store that cannot be
  read or written is never saved.
-->
<script lang="ts">
	import { untrack } from "svelte";
	import Button from "../components/Button.svelte";
	import Dialog from "../components/Dialog.svelte";
	import Fields from "./Fields.svelte";
	import { defaultValues, type FieldValues, missingFields, textValues } from "./fields";
	import { connectStore, mapStoreTypes, type StoreInstance } from "./registry";
	import { newStoreId } from "./settings.svelte";

	interface Props {
		open?: boolean;
		/** The store to edit; a new store when missing. */
		store?: StoreInstance;
		/** Names already used, so a new store gets a different one. */
		takenNames?: string[];
		onsave: (store: StoreInstance) => void;
	}

	let { open = $bindable(false), store, takenNames = [], onsave }: Props = $props();

	const types = $derived(mapStoreTypes());
	let type = $state("");
	let name = $state("");
	let values: FieldValues = $state({});
	let status = $state("");
	let error = $state(false);
	let busy = $state(false);

	const current = $derived(types.find((t) => t.type === type));

	function uniqueName(base: string) {
		let n = base;
		for (let i = 2; takenNames.includes(n); i++) n = `${base} ${i}`;
		return n;
	}

	// Fill the form each time the dialog opens.
	$effect(() => {
		if (!open) return;
		const s = store;
		untrack(() => {
			type = s?.type ?? types[0]?.type ?? "";
			name = s?.name ?? "";
			values = defaultValues(types.find((t) => t.type === type)?.fields ?? [], s?.config ?? {});
			status = "";
			error = false;
		});
	});

	function pickType(t: string) {
		type = t;
		values = defaultValues(current?.fields ?? []);
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!current) return;
		const missing = missingFields(current.fields, values);
		if (missing.length) {
			error = true;
			status = `Please fill in: ${missing.join(", ")}.`;
			return;
		}
		const config = textValues(current.fields, values);
		const instance: StoreInstance = {
			id: store?.id ?? newStoreId(),
			type: current.type,
			name: name.trim() || uniqueName(current.defaultName?.(config) ?? current.label),
			config,
		};
		busy = true;
		error = false;
		status = "Checking…";
		try {
			const checked = await connectStore(instance);
			onsave(checked);
			open = false;
		} catch (err) {
			error = true;
			status = `That store could not be used: ${problem(err)}.`;
		} finally {
			busy = false;
		}
	}

	function problem(err: unknown): string {
		// A network error from a browser usually means the server does not allow this site (CORS).
		if (err instanceof TypeError) return "it could not be reached, or it does not allow this site (CORS)";
		return err instanceof Error ? err.message : String(err);
	}
</script>

<Dialog bind:open title={store ? `Edit ${store.name}` : "Add a place to keep maps"}>
	<form id="okm-store-form" onsubmit={submit} novalidate>
		{#if !store}
			<fieldset class="types">
				<legend>Kind of store</legend>
				{#each types as t (t.type)}
					<label class="type">
						<input type="radio" name="type" value={t.type} checked={type === t.type} onchange={() => pickType(t.type)}>
						<span>
							<strong>{t.label}</strong>
							{#if t.description}
								<span class="desc">{t.description}</span>
							{/if}
						</span>
					</label>
				{/each}
			</fieldset>
		{/if}
		<div class="name">
			<label for="okm-store-name">Name</label>
			<input
				id="okm-store-name"
				bind:value={name}
				placeholder={current
					? uniqueName(current.defaultName?.(textValues(current.fields, values)) ?? current.label)
					: ""}
			>
		</div>
		{#if current}
			{#key current.type}
				<Fields fields={current.fields} bind:values idPrefix="okm-store" disabled={busy} />
			{/key}
		{/if}
		<p class="status" class:error role="status" aria-live="polite">{status}</p>
	</form>
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
		<Button type="submit" form="okm-store-form" disabled={busy || !current}>Check and save</Button>
	{/snippet}
</Dialog>

<style>
	.types {
		margin: 0 0 var(--space-4);
		padding: 0;
		border: 0;
	}

	legend,
	.name label {
		display: block;
		margin-bottom: var(--space-1);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
	}

	.type {
		display: flex;
		gap: var(--space-2);
		align-items: baseline;
		padding: var(--space-1) 0;
	}

	.desc {
		display: block;
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.name {
		margin-bottom: var(--space-4);

		& input {
			box-sizing: border-box;
			width: 100%;
			padding: var(--space-2) var(--space-3);
			border: 1px solid var(--color-border);
			border-radius: var(--radius-sm);
			font: inherit;
			color: var(--color-text);
			background: var(--color-surface);
		}
	}

	.status {
		min-height: 1.5em;
		margin: 0;
		font-size: var(--font-size-sm);

		&.error {
			color: var(--color-danger);
		}
	}
</style>
