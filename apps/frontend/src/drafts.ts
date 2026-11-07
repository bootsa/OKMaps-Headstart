/**
 * Maps made without saving them ("Don't save it now"): kept in this browser
 * for the map page, which can save them later. The newest few are kept.
 */
import { indexedDbStorage, MapLibrary } from "@okmaps/storage";
import type { SavedMap } from "./store.ts";

const KEEP = 10;
let lib: MapLibrary<SavedMap> | undefined;
const drafts = () => {
	lib ??= new MapLibrary<SavedMap>(indexedDbStorage("okmaps-drafts"));
	return lib;
};

export async function saveDraft(map: SavedMap): Promise<void> {
	await drafts().save(map);
	for (const old of (await drafts().list()).slice(KEEP)) await drafts().delete(old.id);
}

export const getDraft = (id: string) => drafts().get(id);
export const deleteDraft = (id: string) => drafts().delete(id);
