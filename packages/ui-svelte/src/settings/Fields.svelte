<!--
  @component
  Draws form fields described as data (FieldSpec). Fields that share a
  `row` sit side by side on wide screens. Bind `values`.
-->
<script lang="ts">
	import type { FieldSpec, FieldValues } from "./fields";

	interface Props {
		fields: FieldSpec[];
		values: FieldValues;
		/** Prefix for element ids, so two forms on a page don't clash. */
		idPrefix?: string;
		disabled?: boolean;
	}

	let { fields, values = $bindable(), idPrefix = "okm-field", disabled = false }: Props = $props();

	/** Consecutive fields with the same row, grouped. */
	const groups = $derived.by(() => {
		const out: FieldSpec[][] = [];
		for (const f of fields) {
			const last = out.at(-1);
			if (f.row && last?.[0]?.row === f.row) last.push(f);
			else out.push([f]);
		}
		return out;
	});

	const id = (f: FieldSpec) => `${idPrefix}-${f.name}`;

	function toggle(name: string, value: string, on: boolean) {
		const list = Array.isArray(values[name]) ? (values[name] as string[]) : [];
		values[name] = on ? [...list.filter((v) => v !== value), value] : list.filter((v) => v !== value);
	}
</script>

{#each groups as group, g (g)}
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
						<select id={id(f)} name={f.name} {disabled} bind:value={values[f.name]}>
							{#each f.options ?? [] as o (o.value)}
								<option value={o.value}>{o.label}</option>
							{/each}
						</select>
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
	select {
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
	}
</style>
