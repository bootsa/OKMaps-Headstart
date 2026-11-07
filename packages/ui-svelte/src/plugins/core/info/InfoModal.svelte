<!-- @component The "More information" modal: the best info page for this map. -->
<script lang="ts">
	import { findInfoPage, type ModalProps } from "../../index";
	import KnowledgeMapInfo from "./KnowledgeMapInfo.svelte";

	let { state: map }: ModalProps = $props();
	const Page = $derived(findInfoPage(map)?.component ?? KnowledgeMapInfo);
</script>

<div class="okm-info">
	<Page state={map} />
</div>

<style>
	.okm-info {
		:global(h3) {
			margin: var(--space-4) 0 var(--space-2);
			font-size: var(--font-size-lg);
		}

		:global(p) {
			margin: 0 0 var(--space-3);
		}
	}
</style>
