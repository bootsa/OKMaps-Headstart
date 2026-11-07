<script lang="ts">
	let { data }: { data: { name: string } } = $props();
</script>

<p>Hello {data.name}</p>
