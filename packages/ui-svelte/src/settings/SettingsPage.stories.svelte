<script module lang="ts">
	import { defineMeta } from "@storybook/addon-svelte-csf";
	import { registerSource, registerStoreType, type StoreInstance } from "./registry";
	import SettingsPage from "./SettingsPage.svelte";
	import { AppSettings } from "./settings.svelte";
	import { davLikeStoreType, demoSource, gatewaySource, memoryStoreType } from "./testing/fakes";

	registerStoreType(memoryStoreType);
	registerStoreType(davLikeStoreType);
	registerSource(demoSource);
	registerSource(gatewaySource);

	const { Story } = defineMeta({
		title: "Settings/Settings page",
		component: SettingsPage,
		tags: ["autodocs"],
	});

	const settings = new AppSettings({
		storage: null,
		seed: (): { stores: StoreInstance[] } => ({
			stores: [
				{ id: "browser", type: "memory", name: "This browser", config: {} },
				{ id: "work", type: "dav", name: "Work cloud", config: { url: "https://work.example/dav/" } },
			],
		}),
	});
</script>

<Story name="Sources and stores">
	<div class="okmaps"><SettingsPage {settings} home="#" /></div>
</Story>
