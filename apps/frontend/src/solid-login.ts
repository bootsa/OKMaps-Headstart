/**
 * Logging in to a Solid Pod (Solid-OIDC, with Inrupt's browser client).
 * The client is loaded only when someone keeps their maps in a Pod.
 */
import type { FetchFn } from "@okmaps/storage";

type Auth = typeof import("@inrupt/solid-client-authn-browser");
let auth: Promise<Auth> | undefined;
const load = () => (auth ??= import("@inrupt/solid-client-authn-browser"));

export interface SolidSession {
	webId: string;
	fetch: FetchFn;
}

/** Identity providers offered in the form; any other can be typed in. */
export const KNOWN_ISSUERS = [
	"https://login.inrupt.com",
	"https://solidcommunity.net",
	"https://solidweb.org",
	"https://teamid.live",
];

/** Sends the browser to the identity provider. It comes back to this page. */
export async function solidLogin(issuer: string): Promise<void> {
	const { login } = await load();
	const back = new URL(location.href);
	back.hash = "";
	await login({ oidcIssuer: issuer, redirectUrl: back.href, clientName: "Open Knowledge Maps" });
}

let session: Promise<SolidSession | null> | undefined;

/**
 * Finishes a login coming back from the identity provider, or restores the
 * session of an earlier one (which may pass through the provider silently).
 * Null when nobody is logged in.
 */
export function solidSession(): Promise<SolidSession | null> {
	return (session ??= (async () => {
		const a = await load();
		// A restored session comes back to the page it logged in from, without
		// the query the page had; put it back.
		a.events().on(a.EVENTS.SESSION_RESTORED, (url: string) => {
			const was = new URL(url);
			if (was.pathname === location.pathname) history.replaceState(null, "", was.href);
			else location.replace(was.href);
		});
		const info = await a.handleIncomingRedirect({ restorePreviousSession: true });
		return info?.isLoggedIn && info.webId ? { webId: info.webId, fetch: (u, i) => a.fetch(u, i) } : null;
	})());
}

/** Ends the session in this app (not at the identity provider). */
export async function solidLogout(): Promise<void> {
	if (!auth) return;
	const { logout } = await auth;
	await logout({ logoutType: "app" });
	session = undefined;
}
