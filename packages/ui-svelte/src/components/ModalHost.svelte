<!--
  @component
  Shows the modal the state names (map.openModal), from whichever plugin
  provides it, in a Dialog. Closing it clears map.modal.
-->
<script lang="ts">
	import type { MapState } from "../data/state.svelte";
	import { findModal } from "../plugins";
	import Dialog from "./Dialog.svelte";

	let { state: map }: { state: MapState } = $props();

	const current = $derived(map.modal);
	const modal = $derived(current ? findModal(current.id) : undefined);
	const Body = $derived(modal?.component);
</script>

{#if current && modal && Body}
	{#key current}
		<Dialog open={true} title={modal.title(map, current.data)} size="lg" onclose={() => map.closeModal()}>
			<Body state={map} data={current.data as never} />
		</Dialog>
	{/key}
{/if}
