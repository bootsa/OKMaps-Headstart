<!--
  @component
  A round button that opens a small panel of display settings (map style,
  dark mode, and whatever the page adds). Escape or a click outside closes
  it. The panel stays in the page while closed, so its settings apply from
  the start.
-->
<script lang="ts">
	import type { Snippet } from "svelte";

	interface Props {
		label?: string;
		children: Snippet;
	}

	let { label = "Display settings", children }: Props = $props();

	const id = $props.id();
	let open = $state(false);
	let root: HTMLElement | undefined = $state();
	let button: HTMLButtonElement | undefined = $state();

	function close(focus = false) {
		open = false;
		if (focus) button?.focus();
	}

	function onpointerdown(e: PointerEvent) {
		if (open && root && !root.contains(e.target as Node)) close();
	}

	function onkeydown(e: KeyboardEvent) {
		if (open && e.key === "Escape") {
			e.stopPropagation();
			close(true);
		}
	}
</script>

<svelte:window {onpointerdown} />

<div class="okm-settings" bind:this={root} {onkeydown} role="presentation">
	<div class="panel" id="{id}-panel" role="group" aria-label={label} hidden={!open}>
		{@render children()}
	</div>
	<button
		bind:this={button}
		type="button"
		class="fab"
		aria-label={label}
		title={label}
		aria-expanded={open}
		aria-controls="{id}-panel"
		onclick={() => (open = !open)}
	>
		<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
			<path
				d="M4 7h10M18 7h2M4 17h2M10 17h10"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
			/>
			<circle cx="16" cy="7" r="2.2" fill="none" stroke="currentColor" stroke-width="2" />
			<circle cx="8" cy="17" r="2.2" fill="none" stroke="currentColor" stroke-width="2" />
		</svg>
	</button>
</div>

<style>
	.okm-settings {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: var(--space-2);
		font-family: var(--font-sans);
	}

	.fab {
		display: grid;
		place-items: center;
		width: 3rem;
		height: 3rem;
		padding: 0;
		border: 1px solid var(--color-border);
		border-radius: 50%;
		background: var(--color-surface);
		color: var(--color-text);
		box-shadow: var(--shadow-raised);
		cursor: pointer;

		&[aria-expanded="true"] {
			background: var(--color-action);
			border-color: var(--color-action);
			color: var(--color-action-text);
		}

		&:focus-visible {
			outline: 2px solid var(--color-focus);
			outline-offset: 2px;
		}
	}

	.panel {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: var(--space-3);
		box-sizing: border-box;
		max-width: calc(100vw - 2 * var(--space-4));
		max-height: 70dvh;
		overflow-y: auto;
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		color: var(--color-text);
		font-size: var(--font-size-sm);
		box-shadow: var(--shadow-overlay);

		&[hidden] {
			display: none;
		}
	}
</style>
