/** Dragging maps between folders and stores (mouse; touch uses "Move to…"). */
import type { MapRef } from "./state.svelte";

export const MAP_TYPE = "application/x-okmaps-map";

export interface DraggedMap extends MapRef {
	title: string;
}

export function startDrag(e: DragEvent, map: DraggedMap): void {
	if (!e.dataTransfer) return;
	e.dataTransfer.setData(MAP_TYPE, JSON.stringify(map));
	e.dataTransfer.setData("text/plain", map.title);
	e.dataTransfer.effectAllowed = "move";
}

export const carriesMap = (e: DragEvent) => !!e.dataTransfer?.types.includes(MAP_TYPE);

export function droppedMap(e: DragEvent): DraggedMap | null {
	try {
		const v = JSON.parse(e.dataTransfer?.getData(MAP_TYPE) || "null");
		return v && typeof v.store === "string" && Array.isArray(v.path) && typeof v.id === "string" ? v : null;
	} catch {
		return null;
	}
}

/** Event handlers that make an element a drop target; `over` tells whether a map is above it. */
export function dropTarget(onDrop: (map: DraggedMap) => void, setOver: (over: boolean) => void) {
	return {
		ondragover: (e: DragEvent) => {
			if (!carriesMap(e)) return;
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
			setOver(true);
		},
		ondragleave: () => setOver(false),
		ondrop: (e: DragEvent) => {
			setOver(false);
			const map = droppedMap(e);
			if (!map) return;
			e.preventDefault();
			onDrop(map);
		},
	};
}
