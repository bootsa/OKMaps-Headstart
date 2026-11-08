/**
 * Registers the sources this build offers (virtual:okmaps/sources): the
 * site's own, the ready-made ones of the config (sources.presets) and the
 * kinds people can add (sources.types, with sources.typePresets first).
 * Each offers only the map views the build has.
 */

import { sources, sourceTypes } from "virtual:okmaps/sources";
import {
	ownSourceId,
	registerSource,
	registerSourceType,
	type SourceInstance,
	type SourceModule,
	type SourceType,
} from "@okmaps/ui-svelte";
import { config } from "./app.ts";

const built = new Set<string>(config.views);

/** The views of `views` this build has. */
export const builtViews = (views: string[] = ["overview"]) => views.filter((v) => built.has(v));

function withBuiltViews<T extends Partial<SourceModule>>(s: T): T | undefined {
	const views = builtViews(s.views);
	return views.length ? { ...s, views } : undefined;
}

/** The config's ready-made sources, as the settings keep own sources. */
export function presetSources(): SourceInstance[] {
	return config.sources.presets.map((p) => ({ id: p.id, type: p.type, name: p.name, config: { ...p.config } }));
}

let done = false;

export function registerAppSources(): void {
	if (done) return;
	done = true;
	for (const s of sources) {
		const kept = withBuiltViews(s);
		if (kept) registerSource(kept);
	}
	for (const p of config.sources.presets) {
		const type = sourceTypes[p.type];
		if (!type) continue;
		const instance = presetSources().find((s) => s.id === p.id && s.type === p.type) as SourceInstance;
		const module = type.module(instance);
		const kept = withBuiltViews({
			...module,
			id: ownSourceId(instance),
			label: p.name,
			description: p.description ?? module.description,
		} as SourceModule);
		if (kept) registerSource(kept);
	}
	for (const id of config.sources.types) {
		const type = sourceTypes[id];
		if (!type) continue;
		registerSourceType({
			...type,
			presets: [...(config.sources.typePresets[id] ?? []), ...(type.presets ?? [])],
			module: (s) => {
				const m = type.module(s);
				const views = builtViews(m.views);
				return { ...m, views: views.length ? views : m.views };
			},
		} as SourceType);
	}
}
