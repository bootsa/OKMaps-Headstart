/**
 * Logging in to a Pod passes through the identity provider, and the session
 * lives in one page only. So the map page does not log in: it reads Pod maps
 * from a copy kept in this browser (made whenever another page reads or
 * saves them), and what it saves waits in that copy until a logged-in page
 * sends it on.
 */
import { type MapStorage, StorageError } from "@okmaps/storage";

/** Thrown, with status 401, when the Pod's login has ended. */
export class LoggedOut extends StorageError {
	readonly issuer: string;
	constructor(issuer: string) {
		super("you are not logged in to your Pod", 401);
		this.issuer = issuer;
	}
}

const UNSENT = "unsent.json";

/**
 * The Pod (`remote`, null when not logged in) seen through its copy in this
 * browser. Logged in, reads come from the Pod and refresh the copy; logged
 * out, they come from the copy, and writes wait in it to be sent.
 */
export function podCopyStorage(remote: MapStorage | null, copy: MapStorage, label: string, issuer: string): MapStorage {
	const unsent = async () => JSON.parse((await copy.get(UNSENT)) ?? "[]") as string[];
	return {
		label,
		async get(key) {
			if (!remote) return copy.get(key);
			const body = await remote.get(key);
			if (body === null) await copy.delete(key);
			else await copy.put(key, body);
			return body;
		},
		async put(key, body, type) {
			await copy.put(key, body, type);
			if (remote) return remote.put(key, body, type);
			const keys = await unsent();
			if (!keys.includes(key)) await copy.put(UNSENT, JSON.stringify([...keys, key]));
		},
		async delete(key) {
			if (!remote) throw new LoggedOut(issuer);
			await remote.delete(key);
			await copy.delete(key);
		},
		list: (prefix) => (remote ? remote.list(prefix) : copy.list(prefix)),
	};
}

/** Sends what a logged-out page saved in the copy. */
export async function sendUnsent(remote: MapStorage, copy: MapStorage): Promise<void> {
	const keys = JSON.parse((await copy.get(UNSENT)) ?? "[]") as string[];
	for (const key of keys) {
		const body = await copy.get(key);
		if (body !== null) await remote.put(key, body);
	}
	await copy.delete(UNSENT);
}
