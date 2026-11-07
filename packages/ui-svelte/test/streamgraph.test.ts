import fs from "node:fs";
import path from "node:path";
import { fireEvent, render, screen, within } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import { infoPlugin, MapState, registerPlugin, unregisterPlugin, Visualization } from "../src/index";
import { labelBox, separateLabels } from "../src/views/streamgraph/labels";

const fixture = (name: string) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8"));
const record = fixture("base-map.json");
const data = fixture("streamgraph.json");

function streamgraphMap() {
	const ids = record.documents.map((d: { id: string }) => d.id);
	const streamgraph = {
		...data,
		subject: data.subject.map((s: Record<string, unknown>, i: number) => ({
			...s,
			ids_overall: ids.slice(i * 3, i * 3 + 3),
		})),
	};
	return new MapState({ ...record, streamgraph }, 600, { visType: "timeline" });
}

afterEach(() => unregisterPlugin("info"));

describe("streamgraph labels", () => {
	it("keeps labels inside the chart", () => {
		const box = labelBox("x", { x: 2, top: 10, bottom: 50 }, 40, 14, 300);
		expect(box.x).toBe(8);
		const right = labelBox("y", { x: 299, top: 10, bottom: 50 }, 40, 14, 300);
		expect(right.x + right.width).toBe(300);
	});

	it("moves overlapping labels apart", () => {
		const a = labelBox("a", { x: 100, top: 40, bottom: 60 }, 40, 14, 300);
		const b = labelBox("b", { x: 100, top: 42, bottom: 62 }, 40, 14, 300);
		const [p, q] = separateLabels([a, b]);
		const apart = p.y + p.height <= q.y || q.y + q.height <= p.y;
		expect(apart).toBe(true);
		expect(a.y).toBe(labelBox("a", { x: 100, top: 40, bottom: 60 }, 40, 14, 300).y);
	});
});

describe("streamgraph view", () => {
	it("draws a stream and a label per keyword, with axes", () => {
		const { container } = render(Visualization, { state: streamgraphMap(), height: 600 });
		expect(container.querySelector(".okm-knowledge-map")).toBeNull();
		expect(container.querySelectorAll(".okm-streamgraph .stream")).toHaveLength(3);
		expect([...container.querySelectorAll(".okm-streamgraph .label text")].map((t) => t.textContent)).toEqual([
			"plankton",
			"salinity",
			"warming",
		]);
		const years = [...container.querySelectorAll(".axis text")].map((t) => t.textContent);
		expect(years).toContain("2018");
		expect(years).toContain("Year");
		expect(years).toContain("Number of resources");
	});

	it("lists a stream's resources when it is picked, and all again from the list", async () => {
		const map = streamgraphMap();
		const { container } = render(Visualization, { state: map, height: 600 });
		await fireEvent.click(screen.getByRole("button", { name: /^salinity:/ }));
		expect(map.selectedStream).toBe("salinity");
		const list = screen.getByRole("region", { name: "Resources" });
		expect(within(list).getByText("salinity")).toBeTruthy();
		expect(container.querySelectorAll(".okm-entry")).toHaveLength(3);
		expect(container.querySelector(".okm-entry .area")).toBeNull();
		expect(container.querySelectorAll(".stream.dim")).toHaveLength(2);
		await fireEvent.click(within(list).getByRole("button", { name: /Show all resources in stream/ }));
		expect(map.selectedStream).toBeNull();
		expect(container.querySelectorAll(".okm-entry")).toHaveLength(map.map.papers.length);
	});

	it("selects a paper of a stream without leaving the stream", async () => {
		const map = streamgraphMap();
		const { container } = render(Visualization, { state: map, height: 600 });
		await fireEvent.click(screen.getByRole("button", { name: /^salinity:/ }));
		const title = container.querySelector(".okm-entry .title button") as HTMLButtonElement;
		await fireEvent.click(title);
		expect(map.selectedPaper).not.toBeNull();
		expect(map.zoomedArea).toBeNull();
		expect(map.selectedStream).toBe("salinity");
		expect(container.querySelectorAll(".okm-entry")).toHaveLength(3);
	});

	it("picks streams from the keyboard", async () => {
		const map = streamgraphMap();
		render(Visualization, { state: map, height: 600 });
		await fireEvent.keyDown(screen.getByRole("button", { name: /^warming:/ }), { key: "Enter" });
		expect(map.selectedStream).toBe("warming");
	});

	it("explains streamgraphs on the info page", async () => {
		registerPlugin(infoPlugin);
		render(Visualization, { state: streamgraphMap(), height: 600 });
		await fireEvent.click(screen.getByRole("button", { name: "More information" }));
		flushSync();
		expect(screen.getByRole("dialog").textContent).toContain("This streamgraph presents you with an overview");
		expect(screen.getByRole("dialog").textContent).toContain("BASE provides access");
	});
});
