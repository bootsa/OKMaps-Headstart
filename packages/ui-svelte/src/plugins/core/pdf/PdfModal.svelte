<!-- @component A paper's PDF in a frame, or a link to where it can be read. -->
<script lang="ts">
	import { t } from "../../../i18n/strings";
	import type { ModalProps } from "../../index";
	import { fallbackUrl, type PdfRequest } from "./pdf";

	let { state: map, data }: ModalProps<PdfRequest> = $props();
	const { paper, resolve, viewer } = $derived(data);

	let url: string | null | undefined = $state(undefined);

	$effect(() => {
		let stale = false;
		url = undefined;
		Promise.resolve(resolve(map, paper)).then(
			(found) => {
				if (!stale) url = found && /^https?:\/\//i.test(found) ? found : null;
			},
			() => {
				if (!stale) url = null;
			},
		);
		return () => {
			stale = true;
		};
	});

	const fallback = $derived(fallbackUrl(map, paper));
</script>

{#if url === undefined}
	<p aria-busy="true">{t(map.strings, "pdf_load_text")}</p>
{:else if url}
	<iframe class="okm-pdf" title="PDF of {paper.title}" src={viewer ? viewer(url) : url}></iframe>
	<p class="open">
		<a href={url} target="_blank" rel="noreferrer noopener">Open the PDF in a new tab</a>
	</p>
{:else}
	<p role="status">
		{t(map.strings, "pdf_not_loaded")}
		{#if fallback}
			<a href={fallback} target="_blank" rel="noreferrer noopener">{t(map.strings, "pdf_not_loaded_linktext")}</a>.
		{/if}
	</p>
{/if}

<style>
	.okm-pdf {
		display: block;
		width: 100%;
		height: min(70vh, 48rem);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: #fff;
	}

	a {
		color: var(--color-link);
	}

	.open {
		margin: var(--space-2) 0 0;
		font-size: var(--font-size-sm);
	}
</style>
