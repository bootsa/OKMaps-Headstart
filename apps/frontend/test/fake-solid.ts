/**
 * A Solid identity provider (https://idp.test) and Pod (https://pod.test/me/)
 * for the browser test: just enough Solid-OIDC (discovery, dynamic client
 * registration, authorization code with PKCE, DPoP-bound tokens, a signed
 * ID token with a webid claim) for Inrupt's browser client to log in.
 * Every login is granted; the Pod only takes writes that carry a DPoP token.
 */
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { fakeSolid } from "../../../packages/storage/test/fakes.ts";

export const ISSUER = "https://idp.test";
export const WEBID = "https://pod.test/me/profile/card#me";

const cors = {
	"access-control-allow-origin": "*",
	"access-control-allow-headers": "authorization, content-type, dpop, accept",
	"access-control-allow-methods": "GET, HEAD, PUT, POST, DELETE",
	"access-control-expose-headers": "link, location, www-authenticate",
};

export interface FakeAnswer {
	status: number;
	headers: Record<string, string>;
	body?: string;
}

export async function fakeSolidWorld() {
	const { publicKey, privateKey } = await generateKeyPair("ES256");
	const jwk = { ...(await exportJWK(publicKey)), alg: "ES256", kid: "k1", use: "sig" };
	const pod = fakeSolid("https://pod.test", "/me/");
	pod.tree.set("/me/profile/", null);
	pod.tree.set("/me/profile/card", `@prefix pim: <http://www.w3.org/ns/pim/space#>.\n<#me> pim:storage </me/>.\n`);
	const clients = new Map<string, string>(); // client_id -> redirect_uri
	const codes = new Map<string, string>(); // code -> client_id
	const log: string[] = [];

	const json = (body: unknown, status = 200): FakeAnswer => ({
		status,
		headers: { ...cors, "content-type": "application/json" },
		body: JSON.stringify(body),
	});

	async function answer(
		method: string,
		url: string,
		headers: Record<string, string>,
		body?: string,
	): Promise<FakeAnswer> {
		const u = new URL(url);
		if (method === "OPTIONS") return { status: 204, headers: cors };
		if (u.origin === ISSUER) {
			log.push(`${method} ${u.pathname}`);
			switch (u.pathname) {
				case "/.well-known/openid-configuration":
					return json({
						issuer: ISSUER,
						authorization_endpoint: `${ISSUER}/auth`,
						token_endpoint: `${ISSUER}/token`,
						registration_endpoint: `${ISSUER}/reg`,
						jwks_uri: `${ISSUER}/jwks`,
						end_session_endpoint: `${ISSUER}/logout`,
						scopes_supported: ["openid", "webid", "offline_access"],
						response_types_supported: ["code"],
						grant_types_supported: ["authorization_code", "refresh_token"],
						id_token_signing_alg_values_supported: ["ES256"],
						dpop_signing_alg_values_supported: ["ES256"],
						token_endpoint_auth_methods_supported: ["client_secret_basic", "none"],
					});
				case "/jwks":
					return json({ keys: [jwk] });
				case "/reg": {
					const meta = JSON.parse(body ?? "{}");
					const id = `client${clients.size + 1}`;
					clients.set(id, meta.redirect_uris[0]);
					return json({ ...meta, client_id: id, client_secret: "s", client_secret_expires_at: 0 }, 201);
				}
				case "/auth": {
					// The person logs in and agrees at once; back to the app with a code.
					const id = u.searchParams.get("client_id")!;
					const back = new URL(u.searchParams.get("redirect_uri")!);
					if (clients.get(id) !== back.href) return { status: 400, headers: {}, body: "unknown redirect" };
					const code = `code${codes.size + 1}`;
					codes.set(code, id);
					back.searchParams.set("code", code);
					back.searchParams.set("state", u.searchParams.get("state")!);
					back.searchParams.set("iss", ISSUER);
					return { status: 302, headers: { location: back.href } };
				}
				case "/token": {
					const form = new URLSearchParams(body);
					const client = codes.get(form.get("code") ?? "");
					if (!client || !headers.dpop || !form.get("code_verifier")) return json({ error: "invalid_grant" }, 400);
					const idToken = await new SignJWT({ webid: WEBID, azp: client })
						.setProtectedHeader({ alg: "ES256", kid: "k1" })
						.setIssuer(ISSUER)
						.setAudience(client)
						.setSubject("me")
						.setIssuedAt()
						.setExpirationTime("1h")
						.sign(privateKey);
					return json({ access_token: "at", id_token: idToken, token_type: "DPoP", expires_in: 3600 });
				}
			}
			return { status: 404, headers: cors };
		}
		// The Pod: writes need a DPoP-bound token and its proof.
		if (method !== "GET" && method !== "HEAD" && !(headers.authorization?.startsWith("DPoP ") && headers.dpop)) {
			return { status: 401, headers: { ...cors, "www-authenticate": "DPoP" } };
		}
		const res = await pod.fetch(url, { method, body });
		return {
			status: res.status,
			headers: { ...cors, "content-type": res.headers.get("content-type") ?? "text/plain" },
			body: await res.text(),
		};
	}
	return { answer, pod, log };
}
