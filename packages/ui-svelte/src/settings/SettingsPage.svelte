<!--
  @component
  The settings page: which metadata sources the search form offers, and the
  places maps are kept (several of one kind are fine, each with its own
  name). Sources and store types come from their registries; the settings
  themselves from an AppSettings.
-->
<script lang="ts">
	import { onMount } from "svelte";
	import Button from "../components/Button.svelte";
	import { getStoreType, mapStoreTypes, metadataSources, type StoreInstance } from "./registry";
	import StoreDialog from "./StoreDialog.svelte";
	import type { AppSettings } from "./settings.svelte";

	interface Props {
		settings: AppSettings;
		/** Where the back link goes. */
		home?: string;
		/** A message to show first (e.g. after a login the start page finished). */
		notice?: string;
		noticeError?: boolean;
	}

	let { settings, home = "./", notice = $bindable(""), noticeError = $bindable(false) }: Props = $props();

	const sources = metadataSources();
	let dialogOpen = $state(false);
	let editing: StoreInstance | undefined = $state();
	let confirmRemove: string | null = $state(null);

	const isDefault = (s: StoreInstance) => settings.saveTo !== "none" && settings.saveTo.store === s.id;

	function add() {
		editing = undefined;
		dialogOpen = true;
	}

	function edit(s: StoreInstance) {
		editing = s;
		dialogOpen = true;
	}

	function saved(s: StoreInstance) {
		const isNew = !settings.store(s.id);
		settings.putStore(s);
		noticeError = false;
		notice = isNew ? `${s.name} was added.` : `${s.name} was saved.`;
	}

	function remove(s: StoreInstance) {
		settings.removeStore(s.id);
		confirmRemove = null;
		noticeError = false;
		notice = `${s.name} was removed from this list. The maps in it were not deleted.`;
	}

	// Back from a login that adding a store started, when it came back here.
	onMount(async () => {
		for (const t of mapStoreTypes()) {
			try {
				const s = await t.resume?.();
				if (s) saved(s);
			} catch (err) {
				noticeError = true;
				notice = `That store could not be used: ${err instanceof Error ? err.message : err}.`;
			}
		}
	});
</script>

<div class="okm-settings-page">
	<header>
		<a class="back" href={home}>← Search and your maps</a>
		<h1>Settings</h1>
		<p class="lead">Kept in this browser only.</p>
	</header>

	<section aria-labelledby="okm-sources-heading">
		<h2 id="okm-sources-heading">Metadata sources</h2>
		<p class="intro">The search form offers the sources switched on here.</p>
		{#if sources.length === 0}
			<p>This site has no sources.</p>
		{:else}
			<ul class="sources">
				{#each sources as source (source.id)}
					{@const why = source.unavailable?.()}
					<li>
						<label>
							<input
								type="checkbox"
								checked={!why && settings.sourceEnabled(source.id)}
								disabled={!!why}
								onchange={(e) => settings.setSourceEnabled(source.id, e.currentTarget.checked)}
							>
							<span>
								<strong>{source.label}</strong>
								{#if source.description}
									<span class="desc">{source.description}</span>
								{/if}
								{#if why}
									<span class="desc why">Not available here: {why}.</span>
								{/if}
							</span>
						</label>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section aria-labelledby="okm-stores-heading">
		<h2 id="okm-stores-heading">Where maps are kept</h2>
		<p class="intro">
			Add as many places as you like, of any kind, each with its own name. New maps are saved to the default one.
		</p>
		<ul class="stores">
			{#each settings.stores as s, i (s.id)}
				{@const type = getStoreType(s.type)}
				<li>
					<div class="store">
						<div class="what">
							<strong>{s.name}</strong>
							{#if isDefault(s)}
								<span class="badge">Default</span>
							{/if}
							<span class="desc">
								{type?.label ?? `${s.type} (not offered on this site)`}
								{#if type?.folders}
									· folders
								{/if}
							</span>
						</div>
						<div class="actions">
							{#if !isDefault(s)}
								<Button size="sm" variant="ghost" onclick={() => settings.setSaveTo({ store: s.id, path: [] })}>
									Make default
								</Button>
							{/if}
							<Button
								size="sm"
								variant="ghost"
								label="Move {s.name} up"
								disabled={i === 0}
								onclick={() => settings.moveStore(s.id, -1)}
								>↑</Button
							>
							<Button
								size="sm"
								variant="ghost"
								label="Move {s.name} down"
								disabled={i === settings.stores.length - 1}
								onclick={() => settings.moveStore(s.id, 1)}
								>↓</Button
							>
							{#if type && type.fields.length > 0}
								<Button size="sm" variant="secondary" onclick={() => edit(s)}>Edit</Button>
							{:else if type}
								<Button size="sm" variant="secondary" onclick={() => edit(s)}>Rename</Button>
							{/if}
							<Button size="sm" variant="secondary" onclick={() => (confirmRemove = s.id)}>Remove</Button>
						</div>
					</div>
					{#if confirmRemove === s.id}
						<div class="confirm" role="alert">
							<span>Remove {s.name} from this list? Its maps are not deleted, and you can add it again.</span>
							<Button size="sm" onclick={() => remove(s)}>Remove</Button>
							<Button size="sm" variant="ghost" onclick={() => (confirmRemove = null)}>Keep</Button>
						</div>
					{/if}
				</li>
			{:else}
				<li class="empty">No places yet: maps can be made but not kept.</li>
			{/each}
		</ul>
		<Button onclick={add} disabled={mapStoreTypes().length === 0}>Add a place to keep maps</Button>
		<p class="notice" class:error={noticeError} role="status" aria-live="polite">{notice}</p>
	</section>
</div>

<StoreDialog
	bind:open={dialogOpen}
	store={editing}
	takenNames={settings.stores.filter((s) => s.id !== editing?.id).map((s) => s.name)}
	onsave={saved}
/>

<style>
	.okm-settings-page {
		max-width: 48rem;
		margin: 0 auto;
		padding: var(--space-6) var(--space-4) var(--space-8);
		font-family: var(--font-sans);
		color: var(--color-text);
	}

	.back {
		color: var(--color-link);
		font-size: var(--font-size-sm);
	}

	h1 {
		margin: var(--space-2) 0 0;
		font-size: var(--font-size-xl);
		color: var(--color-heading);
	}

	h2 {
		margin: var(--space-8) 0 var(--space-1);
		font-size: var(--font-size-lg);
		color: var(--color-heading);
	}

	.lead,
	.intro,
	.desc {
		color: var(--color-text-muted);
	}

	.lead {
		margin: 0;
	}

	.intro {
		margin: 0 0 var(--space-3);
	}

	ul {
		margin: 0 0 var(--space-4);
		padding: 0;
		list-style: none;
	}

	.sources li label {
		display: flex;
		gap: var(--space-3);
		align-items: baseline;
		padding: var(--space-2) 0;
		border-bottom: 1px solid var(--color-border);
	}

	.desc {
		display: block;
		font-size: var(--font-size-sm);
	}

	.why {
		color: var(--color-danger);
	}

	.stores li {
		padding: var(--space-3) 0;
		border-bottom: 1px solid var(--color-border);
	}

	.store {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		align-items: center;
		justify-content: space-between;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}

	.badge {
		margin-left: var(--space-2);
		padding: 0 var(--space-2);
		border-radius: var(--radius-pill);
		font-size: var(--font-size-xs);
		color: var(--color-action-text);
		background: var(--color-accent);
	}

	.confirm {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		align-items: center;
		margin-top: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-sm);
		background: var(--color-surface-muted);
	}

	.empty {
		color: var(--color-text-muted);
	}

	.notice {
		min-height: 1.5em;

		&.error {
			color: var(--color-danger);
		}
	}
</style>
