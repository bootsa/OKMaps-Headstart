import type { Preview } from "@storybook/svelte-vite";
import "../src/styles/index.css";

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
	},
	initialGlobals: { skin: "default" },
	decorators: [
		(story, context) => {
			const skin = context.globals.skin as string;
			if (skin && skin !== "default") document.documentElement.dataset.skin = skin;
			else delete document.documentElement.dataset.skin;
			return story();
		},
	],
	parameters: {
		controls: { expanded: true },
		a11y: { test: "error" },
	},
};

export default preview;
