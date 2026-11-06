/**
 * Runs the gateway handler on Node's http server.
 */
import http from "node:http";
import type { Handler } from "./gateway.ts";

export interface ServeOptions {
	port: number;
	host?: string;
	/**
	 * Take the client address from X-Forwarded-For (first entry). Only set this
	 * behind a proxy that writes the header, or clients can pick their own.
	 */
	trustProxy?: boolean;
}

export function serve(handler: Handler, opts: ServeOptions): http.Server {
	const server = http.createServer(async (req, res) => {
		try {
			const url = `http://${req.headers.host ?? "localhost"}${req.url ?? "/"}`;
			const headers = new Headers();
			for (const [k, v] of Object.entries(req.headers)) {
				if (typeof v === "string") headers.set(k, v);
				else if (Array.isArray(v)) headers.set(k, v.join(", "));
			}
			const forwarded = opts.trustProxy ? req.headers["x-forwarded-for"] : undefined;
			const address =
				(typeof forwarded === "string" ? forwarded.split(",")[0].trim() : undefined) || req.socket.remoteAddress;
			const response = await handler(new Request(url, { method: req.method, headers }), { address });
			const out: Record<string, string> = {};
			response.headers.forEach((v, k) => (out[k] = v));
			res.writeHead(response.status, out);
			res.end(req.method === "HEAD" ? undefined : Buffer.from(await response.arrayBuffer()));
		} catch {
			res.writeHead(500, { "content-type": "application/json" });
			res.end(JSON.stringify({ error: "internal error" }));
		}
	});
	server.listen(opts.port, opts.host);
	return server;
}
