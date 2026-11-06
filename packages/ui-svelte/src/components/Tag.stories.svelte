<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import type { ComponentProps } from "svelte";
  import Tag from "./Tag.svelte";

  const { Story } = defineMeta({
    title: "Components/Tag",
    component: Tag,
    tags: ["autodocs"],
    argTypes: {
      tone: {
        control: "inline-radio",
        options: ["neutral", "accent", "low", "high"],
      },
    },
    args: { tone: "neutral" },
  });
</script>

{#snippet template(args: Omit<ComponentProps<typeof Tag>, "children">)}
  <div class="okmaps"><Tag {...args}>Dataset</Tag></div>
{/snippet}

<Story name="Neutral" {template} />
<Story name="Open access" args={{ tone: "accent" }}>
  {#snippet template(args: Omit<ComponentProps<typeof Tag>, "children">)}
    <div class="okmaps"><Tag {...args}>Open access</Tag></div>
  {/snippet}
</Story>
<Story name="Low value" args={{ tone: "low" }} {template} />
<Story name="High value" args={{ tone: "high" }} {template} />
