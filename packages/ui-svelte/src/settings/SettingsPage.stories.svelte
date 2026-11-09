<script module lang="ts">
	import { AppSettings, registerSource, registerStoreType, type StoreInstance } from "@okmaps/core";
	import { davLikeStoreType, demoSource, gatewaySource, memoryStoreType } from "@okmaps/core/testing";
	import { defineMeta } from "@storybook/addon-svelte-csf";
	import SettingsPage from "./SettingsPage.svelte";

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
