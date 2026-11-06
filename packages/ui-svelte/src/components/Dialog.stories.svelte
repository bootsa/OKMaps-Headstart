<script module lang="ts">
	import { defineMeta } from "@storybook/addon-svelte-csf";
	import type { ComponentProps } from "svelte";
	import Button from "./Button.svelte";
	import Dialog from "./Dialog.svelte";

	const { Story } = defineMeta({
		title: "Components/Dialog",
		component: Dialog,
		tags: ["autodocs"],
		argTypes: {
			size: { control: "inline-radio", options: ["sm", "md", "lg"] },
		},
		args: { title: "About this map", size: "md" },
	});
</script>

<script lang="ts">
	let open = $state(false);
</script>

<Story name="Default">
	{#snippet template(args: Omit<ComponentProps<typeof Dialog>, "children">)}
		<div class="okmaps">
			<Button onclick={() => (open = true)}>Open dialog</Button>
			<Dialog {...args} bind:open>
				<p>
					This knowledge map shows the main areas of a research field. Each bubble is an area; the papers in it are the
					most relevant ones for your search.
				</p>
				{#snippet footer()}
					<Button variant="secondary" onclick={() => (open = false)}>Close</Button>
				{/snippet}
			</Dialog>
		</div>
	{/snippet}
</Story>
