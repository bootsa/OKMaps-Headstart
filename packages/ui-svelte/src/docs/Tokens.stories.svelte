<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import Tokens from "./Tokens.svelte";

  const { Story } = defineMeta({
    title: "Foundations/Tokens",
    component: Tokens,
    parameters: { controls: { disable: true } },
  });

  const text = [
    "--color-text",
    "--color-text-muted",
    "--color-heading",
    "--color-link",
    "--color-journal",
  ];
  const surfaces = [
    "--color-surface",
    "--color-surface-muted",
    "--color-border",
    "--color-highlight",
    "--color-highlight-search",
  ];
  const actions = [
    "--color-accent",
    "--color-accent-strong",
    "--color-action",
    "--color-open-access",
    "--color-focus",
    "--color-danger",
  ];
  const map = [
    "--color-area-fill",
    "--color-area-fill-active",
    "--color-area-stroke",
    "--color-area-title",
    "--color-paper",
    "--color-tag-low",
    "--color-tag-high",
  ];
  const space = [
    "--space-1",
    "--space-2",
    "--space-3",
    "--space-4",
    "--space-6",
    "--space-8",
  ];
  const fonts = [
    "--font-size-xs",
    "--font-size-sm",
    "--font-size-md",
    "--font-size-lg",
    "--font-size-xl",
  ];
</script>

<Story name="Text colours" args={{ names: text }} />
<Story name="Surfaces" args={{ names: surfaces }} />
<Story name="Actions" args={{ names: actions }} />
<Story name="Map" args={{ names: map }} />
<Story name="Spacing" args={{ names: space, kind: "space" }} />
<Story name="Type scale" args={{ names: fonts, kind: "font" }} />
