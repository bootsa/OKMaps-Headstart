import { beforeAll, describe, expect, it } from "vitest";

beforeAll(async () => {
	document.body.innerHTML = '<div id="app"></div>';
	await import("../src/main.ts");
});

describe("configurator page", () => {
	it("shows the full site's config and no problems", () => {
		const out = document.querySelector("textarea") as HTMLTextAreaElement;
		expect(JSON.parse(out.value)).toEqual({ $schema: expect.any(String) });
		expect(document.querySelector(".problems")?.textContent).toMatch(/BASE needs/);
	});

	it("updates the file and the previews as fields change", () => {
		const title = document.querySelector("input[type=text]") as HTMLInputElement;
		title.value = "Lab maps";
		title.dispatchEvent(new Event("input"));
		const out = document.querySelector("textarea") as HTMLTextAreaElement;
		expect(JSON.parse(out.value).site).toEqual({ title: "Lab maps" });
		expect(document.querySelector(".p-title")?.textContent).toBe("Lab maps");
		expect(document.querySelector(".commands")?.textContent).toContain("configs/lab-maps.okmaps.json");
	});

	it("warns about secrets", () => {
		const add = [...document.querySelectorAll("button")].find((b) => b.textContent === "+ OpenAlex")!;
		add.click();
		const key = [...document.querySelectorAll("label")].find((l) => l.textContent?.startsWith("API key"))!;
		const input = document.getElementById(key.htmlFor) as HTMLInputElement;
		input.value = "secret-key";
		input.dispatchEvent(new Event("input"));
		const banner = document.querySelector(".secrets") as HTMLElement;
		expect(banner.hidden).toBe(false);
		expect(banner.textContent).toMatch(/api_key/);
	});
});
