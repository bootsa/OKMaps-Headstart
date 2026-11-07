/**
 * The kinds of store this site offers on the settings page. Each is an
 * opt-in module (registerStoreType); a deployment can leave any out.
 */
import {
	agentFromSecret,
	atomicStorage,
	findPod,
	indexedDbStorage,
	type MapStorage,
	solidStorage,
	treeStore,
	webdavStorage,
} from "@okmaps/storage";
import { registerStoreType, type StoreInstance, type StoreType } from "@okmaps/ui-svelte";
import { podCopyStorage, sendUnsent } from "./pod-copy.ts";
import { KNOWN_ISSUERS, solidLogin, solidSession } from "./solid-login.ts";

/** The IndexedDB database of the first browser store (where maps were kept before there were several). */
export const BROWSER_DB = "okmaps-storage";

const info = (s: StoreInstance) => ({ id: s.id, name: s.name, type: s.type });
const host = (url: string | undefined, fallback: string) => {
	try {
		return url ? new URL(url).host : fallback;
	} catch {
		return fallback;
	}
};

/** Writes a small file and lists the folder: fails unless the store can be read and written. */
async function check(storage: MapStorage): Promise<void> {
	await storage.put("okmaps.txt", "Maps made with Open Knowledge Maps.\n", "text/plain");
	await storage.list();
}

export const browserStoreType: StoreType = {
	type: "browser",
	label: "This browser",
	description: "Works offline; nothing leaves this device. Clearing the browser's site data deletes the maps.",
	fields: [],
	folders: true,
	defaultName: () => "This browser",
	open: async (s) => treeStore(info(s), indexedDbStorage(s.config.db || `okmaps-store-${s.id}`)),
	connect: async (s) => ({ ...s, config: { db: s.config.db || `okmaps-store-${s.id}` } }),
};

const webdav = (s: StoreInstance) =>
	webdavStorage({ url: s.config.url, username: s.config.username || undefined, password: s.config.password });

export const webdavStoreType: StoreType = {
	type: "webdav",
	label: "A WebDAV folder",
	description: "Nextcloud, ownCloud and other WebDAV servers.",
	fields: [
		{
			name: "url",
			label: "Folder URL",
			kind: "url",
			required: true,
			placeholder: "https://cloud.example.org/remote.php/dav/files/me/okmaps/",
		},
		{ name: "username", label: "User name", kind: "text", row: "login", autocomplete: "username" },
		{
			name: "password",
			label: "Password or app password",
			kind: "password",
			row: "login",
			autocomplete: "current-password",
			hint: "The folder's server must allow this site (CORS). The password is kept in this browser only.",
		},
	],
	folders: true,
	defaultName: (c) => host(c.url, "WebDAV"),
	open: async (s) => treeStore(info(s), webdav(s)),
	connect: async (s) => {
		await check(webdav(s));
		return s;
	},
};

const atomic = (s: StoreInstance) =>
	atomicStorage({ parent: s.config.parent, agent: agentFromSecret(s.config.secret) });

export const atomicStoreType: StoreType = {
	type: "atomic",
	label: "An Atomic Data server",
	description: "A Drive or Folder on an Atomic Data server (atomic-server).",
	fields: [
		{
			name: "parent",
			label: "Folder or Drive URL",
			kind: "url",
			required: true,
			placeholder: "https://atomic.example.org/drive/okmaps",
		},
		{
			name: "secret",
			label: "Agent secret",
			kind: "password",
			required: true,
			autocomplete: "off",
			hint: "Under User settings in the Atomic data browser. Kept in this browser only. The server must allow this site (CORS).",
		},
	],
	folders: true,
	defaultName: (c) => host(c.parent, "Atomic Data"),
	open: async (s) => treeStore(info(s), atomic(s)),
	connect: async (s) => {
		await check(atomic(s));
		return s;
	},
};

/** The map page does not log in to Pods (see pod-copy.ts). */
let podLogin = true;
export function withoutPodLogin() {
	podLogin = false;
}

/** A Pod store being added, waiting for the login to come back. */
const PENDING_KEY = "okmaps-store-pending";

export const solidStoreType: StoreType = {
	type: "solid",
	label: "A Solid Pod",
	description: "A folder in your Pod. You log in at your identity provider.",
	fields: [
		{
			name: "issuer",
			label: "Where you log in (your identity provider)",
			kind: "url",
			required: true,
			placeholder: "https://login.inrupt.com",
			suggestions: KNOWN_ISSUERS,
		},
		{
			name: "container",
			label: "Folder in your Pod",
			kind: "url",
			placeholder: "Leave empty for okmaps/ at the top of your Pod",
			hint: "You will be sent to log in and then brought back here. One Pod login at a time.",
		},
	],
	folders: true,
	defaultName: (c) => host(c.container || c.issuer, "Solid Pod"),
	async open(s) {
		const session = podLogin ? await solidSession() : null;
		const pod = solidStorage({ container: s.config.container, fetch: session?.fetch });
		const copy = indexedDbStorage(`okmaps-pod-copy-${s.id}`);
		if (session) await sendUnsent(pod, copy).catch(() => undefined);
		return treeStore(info(s), podCopyStorage(session ? pod : null, copy, pod.label, s.config.issuer));
	},
	async connect(s) {
		localStorage.setItem(PENDING_KEY, JSON.stringify(s));
		await solidLogin(s.config.issuer);
		// The browser is on its way to the identity provider.
		return new Promise<never>(() => {});
	},
	reconnect: (s) => solidLogin(s.config.issuer),
	async resume() {
		let pending: StoreInstance | null = null;
		try {
			pending = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "null");
			localStorage.removeItem(PENDING_KEY);
		} catch {
			return null;
		}
		if (!pending?.config?.issuer) return null;
		const session = await solidSession();
		if (!session) throw new Error("the login did not complete");
		let container = pending.config.container;
		if (!container) {
			const pod = await findPod(session.webId, session.fetch);
			if (!pod) throw new Error(`no Pod was found for ${session.webId}; give the folder's URL`);
			container = `${pod}okmaps/`;
		}
		await check(solidStorage({ container, fetch: session.fetch }));
		const config = { ...pending.config, container };
		return { ...pending, config, name: pending.name || host(container, "Solid Pod") };
	},
};

/** Every store type this site offers. */
export const appStoreTypes = [browserStoreType, webdavStoreType, solidStoreType, atomicStoreType];

export function registerAppStoreTypes(): void {
	for (const t of appStoreTypes) registerStoreType(t);
}
