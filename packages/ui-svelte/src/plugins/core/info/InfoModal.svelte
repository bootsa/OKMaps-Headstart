<!-- @component The "More information" modal: the best info page for this map. -->
<script lang="ts">
	import { findInfoPage, type ModalProps } from "../../index";
	import MapInfo from "./MapInfo.svelte";

	let { state: map }: ModalProps = $props();
	const page = $derived(findInfoPage(map));
	const Page = $derived(page?.component ?? MapInfo);
</script>

<div class="okm-info">
	<Page state={map} {...page?.props} />
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
