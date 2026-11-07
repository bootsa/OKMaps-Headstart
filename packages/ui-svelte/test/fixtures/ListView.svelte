<script lang="ts">
	import type { ViewProps } from "../../src/views/types";

	let { state: map, width, height }: ViewProps = $props();
</script>

<ol data-testid="list-view" data-size="{width}x{height}">
	{#each map.map.papers as paper (paper.safeId)}
		<li>{paper.title}</li>
	{/each}
</ol>
