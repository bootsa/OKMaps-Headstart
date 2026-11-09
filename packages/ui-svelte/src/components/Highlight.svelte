<!--
  @component
  Text with search and query words marked. The text is always rendered as
  text, so markup in a title or author name shows as typed.
-->
<script lang="ts">
	import { highlightParts } from "@okmaps/core";

	interface Props {
		text: string;
		/** Search words (marked anywhere in a word). */
		search?: string[];
		/** Query terms (marked as whole words, when there is no search). */
		query?: string[];
	}

	let { text, search = [], query = [] }: Props = $props();
	const parts = $derived(highlightParts(text, search, query));
</script>

{#each parts as part, i (i)}
	{#if part.mark}
		<mark class={part.mark}>{part.text}</mark>
	{:else}
		{part.text}
	{/if}
{/each}

<style>
	mark {
		color: inherit;
		background: var(--color-highlight);
	}

	mark.query {
		background: none;
		font-weight: var(--font-weight-bold);
	}
</style>
