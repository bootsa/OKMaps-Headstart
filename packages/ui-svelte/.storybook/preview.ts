import type { Preview } from "@storybook/svelte-vite";
import "../src/styles/index.css";
import { registerCoreViews } from "../src/views/core";

// Every view this package ships, before any story builds a map.
registerCoreViews();

const preview: Preview = {
	globalTypes: {
		skin: {
			description: "Colour skin (data-skin on the map's root)",
			toolbar: {
				title: "Skin",
				icon: "paintbrush",
				items: ["default", "viper", "cris_vis", "linkedcat", "covis", "triple"],
				dynamicTitle: true,
			},
		},
		scheme: {
			description: "Light or dark mode (data-scheme on <html>)",
			toolbar: { title: "Mode", icon: "mirror", items: ["light", "dark"], dynamicTitle: true },
		},
	},
	initialGlobals: { skin: "default", scheme: "light" },
	decorators: [
		(story, context) => {
			const skin = context.globals.skin as string;
			if (skin && skin !== "default") document.documentElement.dataset.skin = skin;
			else delete document.documentElement.dataset.skin;
			document.documentElement.dataset.scheme = (context.globals.scheme as string) || "light";
			document.body.style.background = "var(--color-surface)";
			document.body.style.color = "var(--color-text)";
			return story();
		},
	],
	parameters: {
		controls: { expanded: true },
		a11y: { test: "error" },
	},
};

export default preview;
