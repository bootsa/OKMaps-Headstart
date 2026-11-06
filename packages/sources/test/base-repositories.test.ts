import { expect, it } from "vitest";
import { fetchBaseContentProviders, parseBaseRepositories } from "../src/base/repositories.js";

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<collection><collection_name></collection_name><list_repositories><repository><activation_date>2019-12-10</activation_date><name>Zeitschrift für Parteienwissenschaften (E-Journal)</name><internal_name>ftjmip</internal_name></repository><repository><name>Zenodo</name><internal_name>ftzenodo_old</internal_name></repository><repository><name>Zenodo</name><internal_name>ftzenodo</internal_name></repository></list_repositories></collection>`;

it("parses BASE's repository list like rbace and the BASE worker", () => {
  expect([...parseBaseRepositories(xml)]).toEqual([
    ["Zeitschrift für Parteienwissenschaften (E-Journal)", "ftjmip"],
    ["Zenodo", "ftzenodo"],
    ["GoTriple", "fttriple"],
  ]);
});

it("fetches the list from the gateway", async () => {
  const urls: string[] = [];
  const map = await fetchBaseContentProviders("https://gw.example/base/repositories", {
    fetch: async (u) => {
      urls.push(u);
      return new Response(xml);
    },
  });
  expect(map.get("Zenodo")).toBe("ftzenodo");
  expect(urls).toEqual(["https://gw.example/base/repositories"]);
});
