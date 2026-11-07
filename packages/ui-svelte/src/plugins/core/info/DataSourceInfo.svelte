<!-- @component The "Data source" part of the info pages. -->
<script lang="ts">
	import type { Snippet } from "svelte";

	interface Props {
		source: string;
		/** The repository within the source, if the search was limited to one. */
		contentProvider?: string | null;
		logo?: { src: string; href: string; alt: string };
		children?: Snippet;
	}

	let { source, contentProvider, logo, children }: Props = $props();
</script>

<h3>Data source</h3>
<p>
	The data is taken from
	{#if contentProvider}
		{`${contentProvider} (via ${source})`}
	{:else}
		<strong>{source}</strong>
	{/if}
	.
	{@render children?.()}
</p>
{#if logo}
	<p class="logo">
		<a href={logo.href} target="_blank" rel="noreferrer"><img src={logo.src} alt={logo.alt}></a>
	</p>
{/if}

<style>
	.logo img {
		max-width: 160px;
		height: auto;
		border-radius: var(--radius-sm);
		background: #fff;
	}
</style>
