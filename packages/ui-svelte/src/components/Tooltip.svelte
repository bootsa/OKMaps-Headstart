<!--
  @component
  A term with an explanation that shows on hover or keyboard focus (the old
  HoverPopover). The explanation is also the term's accessible description.
-->
<script lang="ts">
	import type { Snippet } from "svelte";

	let { tip, children }: { tip: string; children: Snippet } = $props();
	const id = $props.id();
</script>

<span class="okm-tooltip">
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<span class="term" tabindex="0" aria-describedby={id}>{@render children()}</span>
	<span class="tip" role="tooltip" {id}>{tip}</span>
</span>

<style>
	.okm-tooltip {
		position: relative;
		display: inline-block;
	}

	.term {
		border-bottom: 1px dotted currentColor;
		cursor: help;
	}

	.tip {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		z-index: 10;
		width: max-content;
		max-width: min(22rem, 80vw);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
		box-shadow: var(--shadow-overlay);
		color: var(--color-text);
		font-family: var(--font-sans);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-regular);
		line-height: var(--line-height-normal);
		white-space: pre-line;
		visibility: hidden;
		opacity: 0;
		transition: opacity var(--duration-fast) var(--ease-standard);
	}

	.okm-tooltip:hover .tip,
	.term:focus-visible + .tip {
		visibility: visible;
		opacity: 1;
	}
</style>
