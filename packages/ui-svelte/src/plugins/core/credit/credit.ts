/** The credit line under a map (old CreatedBy and CreateMapButton). */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** "on 7 Nov 2026 at 11:53" in local time, or "" for no or a bad timestamp. */
export function createdAt(timestamp: unknown): string {
	if (typeof timestamp !== "string" || !timestamp) return "";
	const d = new Date(timestamp.replace(" ", "T"));
	if (Number.isNaN(d.getTime())) return "";
	return `on ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} at ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The address without embed=true, so "This visualization" opens the full page. */
export function withoutEmbed(url: string): string {
	try {
		const u = new URL(url);
		u.searchParams.delete("embed");
		u.hash = "";
		return u.toString();
	} catch {
		return url;
	}
}
