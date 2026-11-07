<!--
  @component
  Switches the page between light and dark mode (see scheme.ts).
-->
<script lang="ts">
	import { applyScheme, initialScheme, type Scheme } from "../scheme";

	let scheme: Scheme = $state(initialScheme());
	$effect(() => applyScheme(scheme));

	function toggle() {
		scheme = scheme === "dark" ? "light" : "dark";
		applyScheme(scheme, true);
	}
</script>

<button type="button" class="okm-scheme-toggle" aria-pressed={scheme === "dark"} onclick={toggle}>
	<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
		{#if scheme === "dark"}
			<path d="M10.5 2.5a6 6 0 1 0 3 9 5 5 0 0 1-3-9Z" />
		{:else}
			<circle cx="8" cy="8" r="3" />
			<path
				d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M3 13l1.4-1.4M11.6 4.4 13 3"
				stroke-width="1.5"
				stroke-linecap="round"
			/>
		{/if}
	</svg>
	Dark mode
</button>

<style>
	.okm-scheme-toggle {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: 2px var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-pill);
		background: var(--color-surface);
		color: var(--color-text);
		font-family: var(--font-sans);
		font-size: var(--font-size-sm);
		cursor: pointer;

		&[aria-pressed="true"] {
			border-color: var(--color-accent);
		}

		&:focus-visible {
			outline: 2px solid var(--color-focus);
			outline-offset: 2px;
		}
	}

	svg {
		fill: currentColor;
		stroke: currentColor;
	}
</style>
