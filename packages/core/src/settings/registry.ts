/**
 * Metadata sources and store types: opt-in modules, registered like views
 * and plugins, so a deployment offers only the ones it registers. The
 * settings page lists them, the search form draws the enabled sources'
 * fields, and the explorer opens the person's stores with their type.
 *
 *   registerSource(pubmedSource);
 *   registerSourceType(sparqlSourceType); // sources people set up themselves
 *   registerStoreType(browserStoreType);
 */
import type { MapStore } from "@okmaps/storage";
import type { FieldSpec, FieldValues } from "./fields";

/** Where a search finds documents (PubMed, BASE, a place table, ...). */
export interface SourceModule<Request = unknown> {
	id: string;
	label: string;
	/** One line for the settings page. */
	description?: string;
	/** The search form's fields for this source. */
	fields: FieldSpec[];
	/** Map views (visType ids) it can make; the form offers a choice when there are several. */
	views?: string[];
	/** Why it cannot be used on this site (e.g. "needs a gateway"), or nothing. */
	unavailable?(): string | undefined;
	/** The request the map worker runs, from the form's values and the chosen view. */
	request(values: FieldValues, view: string): Request;
	/** The saved map's title. */
	title(values: FieldValues): string;
}

/** A source someone set up on the settings page: their name for it and its type's config. */
export interface SourceInstance {
	/** Stable id; the source's id is "<type>:<id>". */
	id: string;
	type: string;
	name: string;
	config: Record<string, string>;
}

/** A ready-made config for a source type, offered first in its form. */
export interface SourcePreset {
	id: string;
	label: string;
	description?: string;
	config: Record<string, string>;
}

/**
 * A kind of source people set up themselves on the settings page (a SPARQL
 * endpoint, ...); they can add several of one type, each with its own name.
 */
export interface SourceType<Request = unknown> {
	type: string;
	label: string;
	description?: string;
	/** The fields of a source of this type (endpoint, query, ...). */
	fields: FieldSpec[];
	/** Ready-made configs; picking one fills the fields. */
	presets?: SourcePreset[];
	/** A name for a new source, from its config. */
	defaultName?(config: Record<string, string>): string;
	/** What is wrong with a config, so it is not saved (nothing when it is fine). */
	check?(config: Record<string, string>): string[] | Promise<string[]>;
	/** The source for one of these; its id and label are set from the instance. */
	module(instance: SourceInstance): Omit<SourceModule<Request>, "id" | "label"> & Partial<SourceModule<Request>>;
}

/** A store as the settings keep it: the person's name for it and its type's config. */
export interface StoreInstance {
	/** Stable id, used in map links. */
	id: string;
	type: string;
	name: string;
	config: Record<string, string>;
}

/** A kind of store (this browser, WebDAV, a Solid Pod, ...); people can add several of one type. */
export interface StoreType {
	type: string;
	label: string;
	description?: string;
	/** The fields of a store of this type (URL, user name, ...). */
	fields: FieldSpec[];
	/** Whether its stores can hold folders. */
	folders: boolean;
	/** A name for a new store, from its config. */
	defaultName?(config: Record<string, string>): string;
	/** Opens a store. */
	open(instance: StoreInstance): Promise<MapStore>;
	/**
	 * Checks a new or changed store can be read and written; throws if not.
	 * May leave the page (to log in); `resume` then finishes on the way back.
	 * Without it, the store is opened and listed.
	 */
	connect?(instance: StoreInstance): Promise<StoreInstance>;
	/** Back from a login `connect` started: the store to add, or null. */
	resume?(): Promise<StoreInstance | null>;
	/** Logs in again after the store answered 401 (the explorer offers it). */
	reconnect?(instance: StoreInstance): Promise<void>;
}

const sources = new Map<string, SourceModule>();
const sourceTypes = new Map<string, SourceType>();
const storeTypes = new Map<string, StoreType>();

export function registerSource(source: SourceModule): void {
	sources.set(source.id, source);
}

export function unregisterSource(id: string): void {
	sources.delete(id);
}

/** The registered sources, in the order they were first registered. */
export function metadataSources(): SourceModule[] {
	return [...sources.values()];
}

export function getSource(id: string): SourceModule | undefined {
	return sources.get(id);
}

export function registerSourceType(type: SourceType): void {
	sourceTypes.set(type.type, type);
}

export function unregisterSourceType(type: string): void {
	sourceTypes.delete(type);
}

/** The source types people can add sources of, in the order they were registered. */
export function metadataSourceTypes(): SourceType[] {
	return [...sourceTypes.values()];
}

export function getSourceType(type: string): SourceType | undefined {
	return sourceTypes.get(type);
}

/** The id of the source an instance makes. */
export const ownSourceId = (instance: Pick<SourceInstance, "type" | "id">) => `${instance.type}:${instance.id}`;

/** The source a person's source instance makes, or undefined when its type is not registered. */
export function ownSource(instance: SourceInstance): SourceModule | undefined {
	const type = sourceTypes.get(instance.type);
	if (!type) return undefined;
	return { ...type.module(instance), id: ownSourceId(instance), label: instance.name };
}

/** The site's sources, then the person's own (of the registered types). */
export function allSources(own: readonly SourceInstance[] = []): SourceModule[] {
	return [...sources.values(), ...own.map(ownSource).filter((s): s is SourceModule => !!s)];
}

export function registerStoreType(type: StoreType): void {
	storeTypes.set(type.type, type);
}

export function unregisterStoreType(type: string): void {
	storeTypes.delete(type);
}

export function mapStoreTypes(): StoreType[] {
	return [...storeTypes.values()];
}

export function getStoreType(type: string): StoreType | undefined {
	return storeTypes.get(type);
}

/** Opens a store with its type; throws when the type is not registered. */
export async function openStore(instance: StoreInstance): Promise<MapStore> {
	const type = storeTypes.get(instance.type);
	if (!type) throw new Error(`OKMaps: no store type "${instance.type}" is registered (registerStoreType).`);
	return type.open(instance);
}

/** Checks a store with its type's connect, or by opening and listing it. */
export async function connectStore(instance: StoreInstance): Promise<StoreInstance> {
	const type = storeTypes.get(instance.type);
	if (!type) throw new Error(`OKMaps: no store type "${instance.type}" is registered (registerStoreType).`);
	if (type.connect) return type.connect(instance);
	await (await type.open(instance)).list([]);
	return instance;
}
