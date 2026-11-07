<!--
  @component
  "An update is available": checks every `interval` ms whether the map's
  data changed (the old Google Sheets maps did) and offers a reload.
-->
<script lang="ts">
	import type { MapState } from "../../../data/state.svelte";

	interface Props {
		state: MapState;
		check: (map: MapState) => boolean | Promise<boolean>;
		interval: number;
	}

	let { state: map, check, interval }: Props = $props();

	let available = $state(false);
	let small = $state(false);

	$effect(() => {
		let stopped = false;
		const run = async () => {
			try {
				if (!stopped && !available && (await check(map))) available = true;
			} catch {
				// A failed check says nothing about updates: try again next time.
			}
		};
		const timer = setInterval(run, interval);
		return () => {
			stopped = true;
			clearInterval(timer);
		};
	});
</script>

{#if available}
	<div class="okm-reload" class:small role="status">
		<button type="button" class="reload" onclick={() => window.location.reload()}>
			<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
				<path d="M13 8a5 5 0 1 1-1.5-3.5M13 2v3h-3" fill="none" stroke="currentColor" stroke-width="1.6" />
			</svg>
			{small ? "Reload" : "An update is available: reload now"}
		</button>
		{#if !small}
			<button type="button" class="later" onclick={() => (small = true)}>Do it later</button>
		{/if}
	</div>
{/if}

<style>
	.okm-reload {
		position: absolute;
		top: var(--space-2);
		left: 50%;
		z-index: 2;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-pill);
		background: var(--color-surface);
		box-shadow: var(--shadow-raised);
		font-family: var(--font-sans);
		font-size: var(--font-size-sm);
		transform: translateX(-50%);
	}

	button {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-1) var(--space-2);
		border: 0;
		border-radius: var(--radius-pill);
		background: none;
		color: var(--color-text);
		font: inherit;
		cursor: pointer;

		&:focus-visible {
			outline: 2px solid var(--color-focus);
		}
	}

	.reload {
		background: var(--color-action);
		color: var(--color-action-text);
		font-weight: var(--font-weight-semibold);
	}

	.later {
		color: var(--color-text-muted);
		text-decoration: underline;
	}
</style>
