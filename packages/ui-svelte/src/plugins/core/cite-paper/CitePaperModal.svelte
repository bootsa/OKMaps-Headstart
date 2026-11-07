<!-- @component A paper's citation in APA, MLA, Chicago or ACM, with a copy button. -->
<script lang="ts">
	import CopyButton from "../../../components/CopyButton.svelte";
	import type { Paper } from "../../../data/types";
	import { t } from "../../../i18n/strings";
	import type { ModalProps } from "../../index";
	import { citationStyles, lowQualityCitation, paperCitation } from "./citation";

	let { state: map, data: paper }: ModalProps<Paper> = $props();

	let style = $state(citationStyles[0]);
	let text = $state("");
	let failed = $state(false);

	$effect(() => {
		const current = style;
		let stale = false;
		failed = false;
		paperCitation(paper, current).then(
			(citation) => {
				if (!stale) text = citation;
			},
			() => {
				if (!stale) failed = true;
			},
		);
		return () => {
			stale = true;
		};
	});
</script>

<div class="styles" role="group" aria-label="Citation style">
	{#each citationStyles as s (s.id)}
		<button type="button" aria-pressed={s.id === style.id} onclick={() => (style = s)}>{s.name}</button>
	{/each}
</div>
{#if failed}
	<p role="alert">Sorry, the citation could not be created.</p>
{:else}
	<p class="okm-citation" aria-busy={!text}>{text || t(map.strings, "loading")}</p>
	<p class="muted">{style.description}</p>
	<CopyButton {text} label={t(map.strings, "embed_button_text")} copiedLabel={t(map.strings, "copied_button_text")} />
{/if}
{#if lowQualityCitation(map, paper)}
	<p class="warning">
		<strong>{t(map.strings, "please_note")}:</strong>
		{t(map.strings, "citation_warning")}
	</p>
{/if}

<style>
	.styles {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-bottom: var(--space-3);

		button {
			padding: var(--space-1) var(--space-3);
			border: 1px solid var(--color-border);
			border-radius: var(--radius-pill);
			background: none;
			color: var(--color-text);
			font: inherit;
			cursor: pointer;

			&[aria-pressed="true"] {
				border-color: var(--color-action);
				background: var(--color-action);
				color: var(--color-action-text);
			}

			&:focus-visible {
				outline: 2px solid var(--color-focus);
				outline-offset: 2px;
			}
		}
	}

	.okm-citation {
		padding: var(--space-3);
		border-radius: var(--radius-sm);
		background: var(--color-surface-muted);
		overflow-wrap: anywhere;
		user-select: all;
	}

	.muted {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}

	.warning {
		margin-top: var(--space-4);
	}
</style>
