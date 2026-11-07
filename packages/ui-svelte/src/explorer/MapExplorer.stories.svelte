<script module lang="ts">
	import { memoryStorage, treeStore } from "@okmaps/storage";
	import { defineMeta } from "@storybook/addon-svelte-csf";
	import { registerStoreType, type StoreInstance } from "../settings/registry";
	import { AppSettings } from "../settings/settings.svelte";
	import { memoryStoreType } from "../settings/testing/fakes";
	import MapExplorer from "./MapExplorer.svelte";
	import { ExplorerState } from "./state.svelte";

	registerStoreType(memoryStoreType);
	registerStoreType({ ...memoryStoreType, type: "flat", label: "No folders", folders: false });

	const { Story } = defineMeta({
		title: "Settings/Map explorer",
		component: MapExplorer,
		tags: ["autodocs"],
	});

	const map = (id: string, title: string, service = "pubmed") => ({
		id,
		title,
		created: "2026-11-07T10:00:00Z",
		context: { service },
		documents: Array.from({ length: 40 }, () => ({})),
	});
	const instances: StoreInstance[] = [
		{ id: "browser", type: "memory", name: "This browser", config: {} },
		{ id: "work", type: "memory", name: "Work cloud", config: {} },
		{ id: "flat", type: "flat", name: "Old server", config: {} },
	];
	const stores = Object.fromEntries(
		instances.map((s) => [s.id, treeStore(s, memoryStorage(), { folders: s.type !== "flat" })]),
	);
	const ready = (async () => {
		await stores.browser.save([], map("1", "Sea ice"));
		await stores.browser.save([], map("2", "Digital education", "base"));
		await stores.browser.createFolder?.([], "Reading list");
		await stores.browser.save(["Reading list"], map("3", "Coral reefs"));
		await stores.work.createFolder?.([], "Project A");
	})();
	const settings = new AppSettings({ storage: null, seed: () => ({ stores: instances }) });
	const explorer = new ExplorerState(settings, async (s) => stores[s.id]);
</script>

<Story name="Stores and folders">
	<div class="okmaps" style="min-height: 32rem">
		{#await ready then}
			<MapExplorer {settings} {explorer} mapHref={() => "#"} settingsHref="#" />
		{/await}
	</div>
</Story>
