<script module lang="ts">
	import { defineMeta } from "@storybook/addon-svelte-csf";
	import type { ComponentProps } from "svelte";
	import Button from "./Button.svelte";

	const { Story } = defineMeta({
		title: "Components/Button",
		component: Button,
		tags: ["autodocs"],
		argTypes: {
			variant: {
				control: "inline-radio",
				options: ["primary", "secondary", "ghost"],
			},
			size: { control: "inline-radio", options: ["sm", "md"] },
			disabled: { control: "boolean" },
		},
		args: { variant: "primary", size: "md" },
	});
</script>

{#snippet template(args: Omit<ComponentProps<typeof Button>, "children">)}
	<div class="okmaps"><Button {...args}>Export map</Button></div>
{/snippet}

<Story name="Primary" {template} />
<Story name="Secondary" args={{ variant: "secondary" }} {template} />
<Story name="Ghost" args={{ variant: "ghost" }} {template} />
<Story name="Small" args={{ size: "sm" }} {template} />
<Story name="Disabled" args={{ disabled: true }} {template} />
<Story name="As link" args={{ href: "#" }} {template} />
