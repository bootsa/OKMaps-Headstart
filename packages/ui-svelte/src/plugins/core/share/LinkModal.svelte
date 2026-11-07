<!--
  @component
  The share and embed modals: makes the map's link (which may take a moment,
  e.g. to publish it), then shows it, or the embed code, with a copy button
  and the share links.
-->
<script lang="ts">
	import CopyButton from "../../../components/CopyButton.svelte";
	import { t } from "../../../i18n/strings";
	import type { ModalProps } from "../../index";
	import { embedCode, isWebUrl, type LinkRequest, shareTargets } from "./links";

	let { state: map, data }: ModalProps<LinkRequest> = $props();

	let url: string | null | undefined = $state(undefined);
	let error = $state("");

	$effect(() => {
		let stale = false;
		url = undefined;
		Promise.resolve()
			.then(() => data.link(map))
			.then(
				(made) => {
					if (stale) return;
					if (isWebUrl(made)) url = made;
					else {
						url = null;
						error = "This map has no web address to share.";
					}
				},
				(err) => {
					if (stale) return;
					url = null;
					error = `The map could not be shared: ${err instanceof Error ? err.message : err}`;
				},
			);
		return () => {
			stale = true;
		};
	});

	const s = $derived(map.strings);
	const description = () => document.querySelector<HTMLMetaElement>("meta[name='description']")?.content ?? "";
	const text = $derived(url ? (data.kind === "embed" ? embedCode(url, data.width, data.height) : url) : "");
</script>

{#if url === undefined}
	<p aria-busy="true">Getting a link…</p>
{:else if url === null}
	<p role="alert">{error}</p>
{:else}
	{#if data.kind === "embed"}
		<p>{t(s, "embed_body_text")}</p>
		<pre class="okm-code">{text}</pre>
	{:else}
		<label class="link">
			<span>Link to this map</span>
			<input readonly value={text} onfocus={(e) => e.currentTarget.select()}>
		</label>
	{/if}
	<div class="buttons">
		<CopyButton {text} label={t(s, "embed_button_text")} copiedLabel={t(s, "copied_button_text")} />
		{#if data.kind === "share"}
			{#each shareTargets(url, document.title, description(), data.hashtags) as target (target.id)}
				<a class="target" href={target.href} target="_blank" rel="noreferrer noopener">{target.label}</a>
			{/each}
		{/if}
	</div>
{/if}

<style>
	.okm-code {
		margin: 0 0 var(--space-3);
		padding: var(--space-3);
		border-radius: var(--radius-sm);
		background: var(--color-surface-muted);
		color: var(--color-text);
		font-size: var(--font-size-sm);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		user-select: all;
	}

	.link {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin-bottom: var(--space-3);
		font-size: var(--font-size-sm);

		input {
			padding: var(--space-2) var(--space-3);
			border: 1px solid var(--color-border);
			border-radius: var(--radius-sm);
			background: var(--color-surface);
			color: var(--color-text);
			font: inherit;
		}
	}

	.buttons {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}

	.target {
		padding: var(--space-1) var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-pill);
		color: var(--color-text);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		text-decoration: none;

		&:hover {
			border-color: var(--color-action);
		}

		&:focus-visible {
			outline: 2px solid var(--color-focus);
			outline-offset: 2px;
		}
	}
</style>
