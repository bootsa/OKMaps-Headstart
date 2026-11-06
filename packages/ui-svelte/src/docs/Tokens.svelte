<!-- Swatches for the design tokens, read live from the stylesheet so a skin
     switch in the toolbar shows its values. -->
<script lang="ts">
	interface Props {
		names: string[];
		kind?: "color" | "space" | "font";
	}

	let { names, kind = "color" }: Props = $props();
	let root: HTMLElement;
	let values = $state<Record<string, string>>({});

	$effect(() => {
		const read = () => {
			const style = getComputedStyle(root);
			values = Object.fromEntries(names.map((n) => [n, style.getPropertyValue(n).trim()]));
		};
		read();
		const observer = new MutationObserver(read);
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["data-skin"],
		});
		return () => observer.disconnect();
	});
</script>

<div class="okmaps tokens" bind:this={root}>
	{#each names as name (name)}
		<div class="token">
			{#if kind === "color"}
				<span class="swatch" style:background="var({name})"></span>
			{:else if kind === "space"}
				<span class="bar" style:width="var({name})"></span>
			{:else}
				<span class="sample" style:font-size="var({name})">Aa</span>
			{/if}
			<code>{name}</code>
			<span class="value">{values[name]}</span>
		</div>
	{/each}
</div>

<style>
	.tokens {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
		gap: var(--space-3);
	}

	.token {
		display: grid;
		grid-template-columns: 3rem 1fr;
		align-items: center;
		column-gap: var(--space-3);
	}

	.swatch,
	.bar,
	.sample {
		grid-row: span 2;
	}

	.swatch {
		height: 3rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
	}

	.bar {
		height: var(--space-4);
		background: var(--color-accent);
	}

	code {
		font-size: var(--font-size-xs);
	}

	.value {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}
</style>
