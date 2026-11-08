<!--
  @component
  Adds a source of the person's own, or edits one: its type (when new and
  there are several), a ready-made start (the type's presets), a name and
  the type's fields. "Check and save" runs the type's check first, so a
  source that cannot work is never saved.
-->
<script lang="ts">
	import { untrack } from "svelte";
	import Button from "../components/Button.svelte";
	import Dialog from "../components/Dialog.svelte";
	import Fields from "./Fields.svelte";
	import { defaultValues, type FieldValues, missingFields, textValues } from "./fields";
	import { metadataSourceTypes, type SourceInstance } from "./registry";
	import { newStoreId } from "./settings.svelte";

	interface Props {
		open?: boolean;
		/** The source to edit; a new source when missing. */
		source?: SourceInstance;
		/** Names already used, so a new source gets a different one. */
		takenNames?: string[];
		onsave: (source: SourceInstance) => void;
	}

	let { open = $bindable(false), source, takenNames = [], onsave }: Props = $props();

	const types = $derived(metadataSourceTypes());
	let type = $state("");
	let preset = $state("");
	let name = $state("");
	let values: FieldValues = $state({});
	let status = $state("");
	let error = $state(false);
	let busy = $state(false);
	/** Bumped to redraw the fields with new values (a preset picked). */
	let generation = $state(0);

	const current = $derived(types.find((t) => t.type === type));
	const presets = $derived(current?.presets ?? []);
	const chosenPreset = $derived(presets.find((p) => p.id === preset));

	function uniqueName(base: string) {
		let n = base;
		for (let i = 2; takenNames.includes(n); i++) n = `${base} ${i}`;
		return n;
	}

	function start(t: string, config: Record<string, string> = {}) {
		type = t;
		const ty = types.find((x) => x.type === t);
		const first = Object.keys(config).length || !ty?.presets?.length ? undefined : ty.presets[0];
		preset = first?.id ?? "";
		values = defaultValues(ty?.fields ?? [], first ? first.config : config);
		generation++;
	}

	// Fill the form each time the dialog opens.
	$effect(() => {
		if (!open) return;
		const s = source;
		untrack(() => {
			start(s?.type ?? types[0]?.type ?? "", s?.config ?? {});
			if (s) preset = "";
			name = s?.name ?? "";
			status = "";
			error = false;
		});
	});

	function pickPreset(id: string) {
		preset = id;
		const p = presets.find((x) => x.id === id);
		values = defaultValues(current?.fields ?? [], p?.config ?? source?.config ?? {});
		generation++;
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
		busy = true;
		error = false;
		status = "Checking…";
		try {
			const problems = (await current.check?.(config)) ?? [];
			if (problems.length) {
				error = true;
				status = problems.join(" ");
				return;
			}
			const fallback = chosenPreset?.label ?? current.defaultName?.(config) ?? current.label;
			onsave({
				id: source?.id ?? newStoreId(),
				type: current.type,
				name: name.trim() || uniqueName(fallback),
				config,
			});
			open = false;
		} catch (err) {
			error = true;
			status = `That source could not be used: ${err instanceof Error ? err.message : String(err)}.`;
		} finally {
			busy = false;
		}
	}
</script>

<Dialog bind:open title={source ? `Edit ${source.name}` : "Add a source"}>
	<!-- Only while open, so its fields don't clash with other forms on the page. -->
	{#if open}
		<form id="okm-source-form" onsubmit={submit} novalidate>
			{#if !source && types.length > 1}
				<fieldset class="choices">
					<legend>Kind of source</legend>
					{#each types as t (t.type)}
						<label class="choice">
							<input type="radio" name="type" value={t.type} checked={type === t.type} onchange={() => start(t.type)}>
							<span>
								<strong>{t.label}</strong>
								{#if t.description}
									<span class="desc">{t.description}</span>
								{/if}
							</span>
						</label>
					{/each}
				</fieldset>
			{:else if !source && current?.description}
				<p class="desc intro">{current.description}</p>
			{/if}
			{#if presets.length > 0}
				<div class="field">
					<label for="okm-source-preset">{source ? "Start again from" : "Start from"}</label>
					<select
						id="okm-source-preset"
						value={preset}
						onchange={(e) => pickPreset(e.currentTarget.value)}
						disabled={busy}
					>
						{#if source}
							<option value="">Keep my settings</option>
						{/if}
						{#each presets as p (p.id)}
							<option value={p.id}>{p.label}</option>
						{/each}
						{#if !source}
							<option value="">Nothing: I write my own</option>
						{/if}
					</select>
					{#if chosenPreset?.description}
						<p class="desc">{chosenPreset.description}</p>
					{/if}
				</div>
			{/if}
			<div class="field">
				<label for="okm-source-name">Name</label>
				<input
					id="okm-source-name"
					bind:value={name}
					placeholder={current
						? uniqueName(
								chosenPreset?.label ?? current.defaultName?.(textValues(current.fields, values)) ?? current.label,
							)
						: ""}
				>
			</div>
			{#if current}
				{#key `${current.type}-${generation}`}
					<Fields fields={current.fields} bind:values idPrefix="okm-source" disabled={busy} />
				{/key}
			{/if}
			<p class="status" class:error role="status" aria-live="polite">{status}</p>
		</form>
	{/if}
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
		<Button type="submit" form="okm-source-form" disabled={busy || !current}>Check and save</Button>
	{/snippet}
</Dialog>

<style>
	.choices {
		margin: 0 0 var(--space-4);
		padding: 0;
		border: 0;
	}

	legend,
	.field label {
		display: block;
		margin-bottom: var(--space-1);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
	}

	.choice {
		display: flex;
		gap: var(--space-2);
		align-items: baseline;
		padding: var(--space-1) 0;
	}

	.desc {
		display: block;
		margin: var(--space-1) 0 0;
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.intro {
		margin: 0 0 var(--space-4);
	}

	.field {
		margin-bottom: var(--space-4);

		& input,
		& select {
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
