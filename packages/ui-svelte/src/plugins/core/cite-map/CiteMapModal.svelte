<!-- @component How to cite this map, with a copy button. -->
<script lang="ts">
	import { t } from "@okmaps/core";
	import CopyButton from "../../../components/CopyButton.svelte";
	import type { ModalProps } from "../../index";
	import { citationLabels, mapCitation } from "./citation";

	let { state: map }: ModalProps = $props();
	const text = $derived(mapCitation(map, window.location.href));
</script>

<p>{citationLabels(map).instruction}:</p>
<p class="okm-citation">{text}</p>
<CopyButton {text} label={t(map.strings, "embed_button_text")} copiedLabel={t(map.strings, "copied_button_text")} />

<style>
	.okm-citation {
		padding: var(--space-3);
		border-radius: var(--radius-sm);
		background: var(--color-surface-muted);
		overflow-wrap: anywhere;
		user-select: all;
	}
</style>
