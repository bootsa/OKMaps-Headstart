<!--
  @component
  The search form, built from the metadata sources switched on in the
  settings: a choice of source, the map type where the source can make
  several, the source's own fields, and where to keep the new map (a store
  from the settings, or nowhere: it can be saved later from the map page).
-->
<script lang="ts">
	import Button from "../components/Button.svelte";
	import Fields from "../settings/Fields.svelte";
	import { defaultValues, type FieldValues, missingFields } from "../settings/fields";
	import { allSources, type SourceModule } from "../settings/registry";
	import type { AppSettings, SaveTarget } from "../settings/settings.svelte";
	import { getView, hasView } from "../views/registry";
	import type { SearchSubmit } from "./types";

	interface Props {
		settings: AppSettings;
		/** Makes the map; a thrown Error's message is shown to the person. */
		onsearch: (search: SearchSubmit) => Promise<void>;
		/** A longer label for a map type than its view's own. */
		viewLabel?: (view: string) => string | undefined;
		/** Where the settings are, for the hints. */
		settingsHref?: string;
	}

	let { settings, onsearch, viewLabel, settingsHref }: Props = $props();

	const sources = $derived(
		allSources(settings.sources).filter((s) => !s.unavailable?.() && settings.sourceEnabled(s.id)),
	);
	let sourceId = $state("");
	const source = $derived(sources.find((s) => s.id === sourceId) ?? sources[0]);
	/** Each source keeps its own values while another is chosen. */
	const valuesBySource: Record<string, FieldValues> = $state({});
	const views: Record<string, string> = $state({});
	let status = $state("");
	let error = $state(false);
	let busy = $state(false);

	$effect(() => {
		if (source && !valuesBySource[source.id]) valuesBySource[source.id] = defaultValues(source.fields);
		if (source && !views[source.id]) views[source.id] = source.views?.[0] ?? "overview";
	});

	const label = (view: string) => viewLabel?.(view) ?? (hasView(view) ? getView(view).label : view);
	const offeredViews = $derived(source?.views ?? []);

	/** The save choice as one select value. */
	const NONE = "none";
	const targetKey = (t: SaveTarget) => (t === "none" ? NONE : JSON.stringify([t.store, ...t.path]));
	const saveOptions = $derived.by(() => {
		const out = settings.stores.map((s) => ({ key: targetKey({ store: s.id, path: [] }), label: s.name }));
		const t = settings.saveTo;
		if (t !== "none" && t.path.length) {
			const name = settings.store(t.store)?.name ?? t.store;
			out.push({ key: targetKey(t), label: [name, ...t.path].join(" / ") });
		}
		return out;
	});
	const saveKey = $derived(targetKey(settings.saveTo));

	function pickSave(key: string) {
		if (key === NONE) return settings.setSaveTo("none");
		const [store, ...path] = JSON.parse(key) as string[];
		settings.setSaveTo({ store, path });
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!source || busy) return;
		const values = valuesBySource[source.id] ?? {};
		const missing = missingFields(source.fields, values);
		if (missing.length) {
			error = true;
			status = `Please fill in: ${missing.join(", ")}.`;
			return;
		}
		const view = views[source.id] ?? source.views?.[0] ?? "overview";
		busy = true;
		error = false;
		status = "";
		try {
			await onsearch({
				source,
				request: source.request($state.snapshot(values) as FieldValues, view),
				view,
				title: source.title($state.snapshot(values) as FieldValues),
				saveTo: $state.snapshot(settings.saveTo),
				progress: (text) => (status = text),
			});
		} catch (err) {
			error = true;
			status = err instanceof Error ? err.message : String(err);
		} finally {
			busy = false;
		}
	}
</script>

<form class="okm-search" id="search" onsubmit={submit} novalidate>
	{#if sources.length === 0}
		<p class="status error">
			Every source is switched off.
			{#if settingsHref}
				<a href={settingsHref}>Switch one on in the settings.</a>
			{/if}
		</p>
	{:else}
		<fieldset class="sources">
			<legend>Source</legend>
			{#each sources as s (s.id)}
				<label class="choice">
					<input
						type="radio"
						name="service"
						value={s.id}
						checked={s.id === source?.id}
						onchange={() => (sourceId = s.id)}
					>
					{s.label}
				</label>
			{/each}
		</fieldset>

		{#if source}
			{#if offeredViews.length > 1}
				<div class="field">
					<label for="vis_type">Map type</label>
					<select id="vis_type" name="vis_type" bind:value={views[source.id]} disabled={busy}>
						{#each offeredViews as v (v)}
							<option value={v}>{label(v)}</option>
						{/each}
					</select>
				</div>
			{/if}
			{#if valuesBySource[source.id]}
				{#key source.id}
					<Fields fields={source.fields} bind:values={valuesBySource[source.id]} idPrefix="" disabled={busy} />
				{/key}
			{/if}
			{#if source.description}
				<p class="hint">{source.description}</p>
			{/if}
		{/if}

		<div class="field">
			<label for="save_to">Keep the map in</label>
			<select
				id="save_to"
				name="save_to"
				value={saveKey}
				onchange={(e) => pickSave(e.currentTarget.value)}
				disabled={busy}
			>
				{#each saveOptions as o (o.key)}
					<option value={o.key}>{o.label}</option>
				{/each}
				<option value={NONE}>Don't save it now (save it from the map)</option>
			</select>
		</div>

		<Button type="submit" id="submit" disabled={busy}>Make map</Button>
	{/if}
	<p id="status" class="status" class:error role="status" aria-live="polite">{status}</p>
</form>

<style>
	.okm-search {
		padding: var(--space-6);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		font-family: var(--font-sans);
		color: var(--color-text);
		background: var(--color-surface-muted);
	}

	fieldset {
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
		display: inline-flex;
		gap: var(--space-2);
		align-items: center;
		margin-right: var(--space-4);
	}

	.field {
		margin-bottom: var(--space-4);
	}

	select {
		display: block;
		box-sizing: border-box;
		width: 100%;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font: inherit;
		color: var(--color-text);
		background: var(--color-surface);
	}

	.hint {
		margin: calc(-1 * var(--space-2)) 0 var(--space-4);
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.status {
		min-height: 1.5em;
		margin: var(--space-3) 0 0;
		color: var(--color-text-muted);

		&.error {
			color: var(--color-danger);
		}
	}
</style>
