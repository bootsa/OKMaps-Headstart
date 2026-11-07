<!--
  @component
  "This visualization was created by Open Knowledge Maps on ... For more
  information read our FAQs", and a "Create a knowledge map" link, at the
  bottom left of the map.
-->
<script lang="ts">
	import logo from "../../../assets/okmaps-logo-round.svg";
	import type { MapState } from "../../../data/state.svelte";
	import type { LinkMaker } from "../share/links";
	import { createdAt, withoutEmbed } from "./credit";

	interface Props {
		state: MapState;
		by: { name: string; url: string };
		faqs?: string;
		/** Where "Create a knowledge map" goes; none hides it. */
		create?: string;
		/** When the map was made; by default the map's last_update. */
		timestamp?: string;
		link: LinkMaker;
	}

	let { state: map, by, faqs, create, timestamp, link }: Props = $props();

	const when = $derived(createdAt(timestamp ?? map.map.context.last_update));
	let href = $state("");
	$effect(() => {
		let current = true;
		Promise.resolve(link(map))
			.then((url) => {
				if (current) href = withoutEmbed(url);
			})
			.catch(() => {});
		return () => {
			current = false;
		};
	});
	const showCreate = $derived(!!create && map.config.visType === "overview");
</script>

<div class="okm-credit">
	<p>
		<img src={logo} alt="" width="16" height="16">
		{#if href}
			<a {href} target="_blank" rel="noreferrer">This visualization</a>
		{:else}
			This visualization
		{/if}
		was created by
		<a href={by.url} target="_blank" rel="noreferrer">{by.name}</a>{when ? ` ${when}` : ""}.
		{#if faqs}
			For more information <a href={faqs} target="_blank" rel="noreferrer">read our FAQs</a>.
		{/if}
	</p>
	{#if showCreate}
		<a class="create" href={create} target="_blank" rel="noreferrer">Create a knowledge map</a>
	{/if}
</div>

<style>
	.okm-credit {
		position: absolute;
		left: var(--space-4);
		bottom: var(--okm-overlay-bottom, var(--space-4));
		z-index: 1;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-3);
		max-width: calc(100% - 2 * var(--space-4) - 4rem);
		color: var(--color-text-muted);
		font-family: var(--font-sans);
		font-size: var(--font-size-xs);
		line-height: var(--line-height-normal);
	}

	p {
		margin: 0;
	}

	img {
		vertical-align: -3px;
	}

	a {
		color: inherit;
		text-decoration: underline;
	}

	.create {
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-pill);
		background: var(--color-action);
		color: var(--color-action-text);
		font-weight: var(--font-weight-semibold);
		text-decoration: none;
	}
</style>
