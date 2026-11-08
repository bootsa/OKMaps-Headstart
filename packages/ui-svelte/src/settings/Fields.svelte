<!--
  @component
  Draws form fields described as data (FieldSpec). Fields that share a
  `row` sit side by side on wide screens; fields that share a `section` are
  folded under its name. Bind `values`.
-->
<script lang="ts">
	import { onDestroy, untrack } from "svelte";
	import type { FieldOption, FieldSpec, FieldValues } from "./fields";

	interface Props {
		fields: FieldSpec[];
		values: FieldValues;
		/** Prefix for element ids, so two forms on a page don't clash ("" for the bare field names). */
		idPrefix?: string;
		disabled?: boolean;
	}

	let { fields, values = $bindable(), idPrefix = "okm-field", disabled = false }: Props = $props();

	/** Consecutive fields with the same row, grouped. */
	function rows(list: FieldSpec[]): FieldSpec[][] {
		const out: FieldSpec[][] = [];
		for (const f of list) {
			const last = out.at(-1);
			if (f.row && last?.[0]?.row === f.row) last.push(f);
			else out.push([f]);
		}
		return out;
	}

	/** Consecutive fields with the same section (or none), grouped. */
	const sections = $derived.by(() => {
		const out: { name?: string; fields: FieldSpec[] }[] = [];
		for (const f of fields) {
			const last = out.at(-1);
			if (last && last.name === f.section) last.fields.push(f);
			else out.push({ name: f.section, fields: [f] });
		}
		return out;
	});

	const id = (f: FieldSpec) => (idPrefix ? `${idPrefix}-${f.name}` : f.name);

	// Options loaded by loadOptions, per field.
	interface Loaded {
		options?: FieldOption[];
		busy: boolean;
		error?: string;
	}
	let loaded: Record<string, Loaded> = $state({});
	const lastKey: Record<string, string> = {};
	const timers: Record<string, ReturnType<typeof setTimeout>> = {};
	const running: Record<string, AbortController> = {};

	async function load(f: FieldSpec) {
		if (!f.loadOptions) return;
		running[f.name]?.abort();
		const ctrl = new AbortController();
		running[f.name] = ctrl;
		loaded[f.name] = { options: loaded[f.name]?.options, busy: true };
		try {
			const options = await f.loadOptions($state.snapshot(values) as FieldValues, ctrl.signal);
			if (ctrl.signal.aborted) return;
			loaded[f.name] = { options, busy: false };
			// A value the new options don't have (another library's collection) gives way to the first.
			const v = String(values[f.name] ?? "");
			if (options.length && !options.some((o) => o.value === v)) values[f.name] = options[0].value;
		} catch (err) {
			if (ctrl.signal.aborted) return;
			loaded[f.name] = {
				options: loaded[f.name]?.options,
				busy: false,
				error: err instanceof Error ? err.message : String(err),
			};
		}
	}

	// Load when the form opens, and again a moment after a field it depends on changes.
	$effect(() => {
		for (const f of fields) {
			if (!f.loadOptions) continue;
			const key = JSON.stringify((f.dependsOn ?? []).map((n) => values[n] ?? ""));
			if (lastKey[f.name] === key) continue;
			const first = lastKey[f.name] === undefined;
			lastKey[f.name] = key;
			untrack(() => {
				clearTimeout(timers[f.name]);
				timers[f.name] = setTimeout(() => load(f), first ? 0 : 600);
			});
		}
	});

	onDestroy(() => {
		for (const t of Object.values(timers)) clearTimeout(t);
		for (const c of Object.values(running)) c.abort();
	});

	/** A select's options: loaded ones (or the spec's), and the current value if they lack it. */
	function optionsOf(f: FieldSpec): FieldOption[] {
		const list = loaded[f.name]?.options ?? f.options ?? [];
		const v = String(values[f.name] ?? "");
		return v && !list.some((o) => o.value === v) ? [...list, { value: v, label: v }] : list;
	}

	function toggle(name: string, value: string, on: boolean) {
		const list = Array.isArray(values[name]) ? (values[name] as string[]) : [];
		values[name] = on ? [...list.filter((v) => v !== value), value] : list.filter((v) => v !== value);
	}
</script>

{#each sections as section, i (i)}
	{#if section.name}
		<details class="okm-fields-section">
			<summary>{section.name}</summary>
			{@render rowsOf(section.fields)}
		</details>
	{:else}
		{@render rowsOf(section.fields)}
	{/if}
{/each}

{#snippet rowsOf(list: FieldSpec[])}
	{#each rows(list) as group, g (g)}
		<div class="okm-fields-row" class:row={group.length > 1}>
			{#each group as f (f.name)}
				{#if f.kind === "checkboxes"}
					<fieldset class="field">
						<legend>{f.label}</legend>
						<div class="choices">
							{#each f.options ?? [] as o (o.value)}
								<label class="choice">
									<input
										type="checkbox"
										name={f.name}
										value={o.value}
										{disabled}
										checked={Array.isArray(values[f.name]) && (values[f.name] as string[]).includes(o.value)}
										onchange={(e) => toggle(f.name, o.value, e.currentTarget.checked)}
									>
									{o.label}
								</label>
							{/each}
						</div>
						{#if f.hint}
							<p class="hint">{f.hint}</p>
						{/if}
					</fieldset>
				{:else}
					<div class="field">
						<label for={id(f)}
							>{f.label}
							{#if !f.required && f.kind !== "select"}
								<span class="optional"> (optional)</span>
							{/if}</label
						>
						{#if f.kind === "select"}
							<div class="select-row">
								<select id={id(f)} name={f.name} {disabled} bind:value={values[f.name]}>
									{#each optionsOf(f) as o (o.value)}
										<option value={o.value}>{o.label}</option>
									{/each}
								</select>
								{#if f.loadOptions}
									<button
										type="button"
										class="reload"
										aria-label="Load {f.label.toLowerCase()} again"
										title="Load again"
										disabled={disabled || loaded[f.name]?.busy}
										onclick={() => load(f)}
									>
										↻
									</button>
								{/if}
							</div>
							{#if loaded[f.name]?.busy}
								<p class="hint" role="status">Loading…</p>
							{:else if loaded[f.name]?.error}
								<p class="hint error" role="status">{loaded[f.name]?.error}</p>
							{/if}
						{:else if f.kind === "textarea"}
							<textarea
								id={id(f)}
								name={f.name}
								required={f.required}
								placeholder={f.placeholder}
								rows={f.lines ?? 6}
								spellcheck={f.code ? false : undefined}
								class:code={f.code}
								{disabled}
								bind:value={values[f.name]}
							></textarea>
						{:else}
							<input
								id={id(f)}
								name={f.name}
								type={f.kind}
								required={f.required}
								placeholder={f.placeholder}
								autocomplete={f.autocomplete}
								list={f.suggestions ? `${id(f)}-list` : undefined}
								{disabled}
								bind:value={values[f.name]}
							>
							{#if f.suggestions}
								<datalist id="{id(f)}-list">
									{#each f.suggestions as s (s)}
										<option value={s}></option>
									{/each}
								</datalist>
							{/if}
						{/if}
						{#if f.hint}
							<p class="hint">{f.hint}</p>
						{/if}
					</div>
				{/if}
			{/each}
		</div>
	{/each}
{/snippet}

<style>
	.okm-fields-row {
		margin-bottom: var(--space-4);
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);

		& > .field {
			flex: 1 1 10rem;
		}
	}

	fieldset {
		margin: 0;
		padding: 0;
		border: 0;
	}

	label,
	legend {
		display: block;
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text);
	}

	.optional {
		font-weight: var(--font-weight-regular);
		color: var(--color-text-muted);
	}

	input:not([type="checkbox"]),
	select,
	textarea {
		display: block;
		box-sizing: border-box;
		width: 100%;
		margin-top: var(--space-1);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--color-border-strong, var(--color-border));
		border-radius: var(--radius-sm);
		font: inherit;
		color: var(--color-text);
		background: var(--color-surface);
	}

	textarea {
		resize: vertical;

		&.code {
			font-family: var(--font-mono);
			font-size: var(--font-size-sm);
			white-space: pre;
			overflow-wrap: normal;
			overflow-x: auto;
		}
	}

	.okm-fields-section {
		margin-bottom: var(--space-4);

		& > summary {
			margin-bottom: var(--space-3);
			cursor: pointer;
			font-size: var(--font-size-sm);
			font-weight: var(--font-weight-semibold);
			color: var(--color-link);
		}
	}

	.choices {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-4);
		margin-top: var(--space-1);
	}

	.choice {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-weight: var(--font-weight-regular);
	}

	.hint {
		margin: var(--space-1) 0 0;
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);

		&.error {
			color: var(--color-danger);
		}
	}

	.select-row {
		display: flex;
		gap: var(--space-2);
		align-items: flex-end;

		& > select {
			flex: 1 1 auto;
			min-width: 0;
		}
	}

	.reload {
		flex: none;
		min-width: 2.5rem;
		padding: var(--space-2);
		border: 1px solid var(--color-border-strong, var(--color-border));
		border-radius: var(--radius-sm);
		font: inherit;
		color: var(--color-text);
		background: var(--color-surface);
		cursor: pointer;

		&:disabled {
			cursor: default;
			opacity: 0.5;
		}
	}
</style>
