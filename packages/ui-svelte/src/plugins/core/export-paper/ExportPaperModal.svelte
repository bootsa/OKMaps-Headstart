<!-- @component A paper as BibTeX, to copy or download as a .bib file. -->
<script lang="ts">
	import type { Paper } from "@okmaps/core";
	import { t } from "@okmaps/core";
	import Button from "../../../components/Button.svelte";
	import CopyButton from "../../../components/CopyButton.svelte";
	import type { ModalProps } from "../../index";
	import { bibtexFileName, paperBibtex } from "./bibtex";

	let { state: map, data: paper }: ModalProps<Paper> = $props();
	const bibtex = $derived(paperBibtex(paper));

	function download() {
		const url = URL.createObjectURL(new Blob([bibtex], { type: "application/x-bibtex;charset=utf-8" }));
		const a = document.createElement("a");
		a.href = url;
		a.download = bibtexFileName(paper);
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 0);
	}
</script>

<p><strong>BibTeX</strong></p>
<pre class="okm-bibtex">{bibtex}</pre>
<div class="buttons">
	<CopyButton
		text={bibtex}
		label={t(map.strings, "embed_button_text")}
		copiedLabel={t(map.strings, "copied_button_text")}
	/>
	<Button variant="secondary" size="sm" onclick={download}>{t(map.strings, "download")}</Button>
</div>

<style>
	.okm-bibtex {
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

	.buttons {
		display: flex;
		gap: var(--space-2);
	}
</style>
