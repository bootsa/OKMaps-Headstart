/**
 * A map record to what the views draw. For a knowledge map (and the list
 * next to a geo map), for a square chart of
 * `size` px: papers placed by their layout coordinates, areas at the mean
 * of their papers, sized by the summed metric. The force layout that then
 * separates the bubbles is in ../map (it runs once the chart is shown).
 */
import { extent } from "d3-array";
import { mapConfig, type MapConfig, type Service } from "./config";
import { processPaper } from "./papers";
import { strings, type Strings } from "../i18n/strings";
import {
  areaCoordsScale,
  areaRadiusScale,
  initialCoordsScale,
  paperDiameterScale,
  resizeFactors,
  resizeScale,
} from "./scale";
import { parseStreams } from "./streams";
import type { Area, MapRecord, Paper, ProcessedMap } from "./types";

const GOLDEN_RATIO = 2.6;
const ext = (values: number[]): [number, number] => {
  const [a, b] = extent(values);
  return [a ?? 0, b ?? 0];
};

export interface ProcessOptions {
  config?: MapConfig;
  strings?: Strings;
}

export function processMap(
  record: MapRecord,
  size: number,
  options: ProcessOptions = {},
): ProcessedMap {
  const config =
    options.config ?? mapConfig((record.context.service as Service) ?? "base");
  const s = options.strings ?? strings(config.language);

  const papers = record.documents.map((doc) =>
    processPaper(doc, config, s, record.context),
  );
  if (config.visType === "timeline") {
    // Streamgraphs place nothing on a map.
    const streams = parseStreams(record.streamgraph);
    return { context: record.context, papers, areas: [], streams, size };
  }
  separateDuplicates(papers);

  const [paperFactor, bubbleFactor] = resizeFactors(
    papers.length,
    config.dynamicSizing,
  );
  const bubbleMin = config.bubbleMinScale * bubbleFactor;
  const bubbleMax = config.bubbleMaxScale * bubbleFactor;

  const xScale = initialCoordsScale(ext(papers.map((p) => p.x)), size);
  const yScale = initialCoordsScale(ext(papers.map((p) => p.y)), size);
  const dScale = paperDiameterScale(
    ext(papers.map((p) => p.internalReaders)),
    size,
    config,
    config.paperMinScale * paperFactor,
    config.paperMaxScale * paperFactor,
  );
  for (const p of papers) {
    p.x = xScale(p.x);
    p.y = yScale(p.y);
    p.diameter = dScale(p.internalReaders);
    const side = Math.sqrt(p.diameter ** 2 / GOLDEN_RATIO);
    p.width = config.paperWidthFactor * side;
    p.height = config.paperHeightFactor * side;
  }

  const areas = groupAreas(papers);
  // The old code averages -y for the areas (the layout's y axis points up).
  const centres = areas.map((a) => ({
    x: mean(a.papers.map((p) => p.x)),
    y: mean(a.papers.map((p) => -p.y)),
  }));
  const axScale = areaCoordsScale(
    ext(centres.map((c) => c.x)),
    size,
    config,
    bubbleMax,
  );
  const ayScale = areaCoordsScale(
    ext(centres.map((c) => c.y)),
    size,
    config,
    bubbleMax,
  );
  const rScale = areaRadiusScale(
    ext(areas.map((a) => a.readers)),
    size,
    config,
    bubbleMin,
    bubbleMax,
  );
  areas.forEach((a, i) => {
    a.x = axScale(centres[i].x);
    a.y = ayScale(centres[i].y);
    a.r = rScale(a.readers);
  });

  return { context: record.context, papers, areas, streams: [], size };
}

/** Papers on the same spot are nudged apart (the old code adds 1e-8 to y). */
function separateDuplicates(papers: Paper[]) {
  const taken = new Set<string>();
  for (const p of papers) {
    p.x = round8(p.x);
    p.y = round8(p.y);
    while (taken.has(`${p.x}:${p.y}`)) p.y = round8(p.y + 1e-8);
    taken.add(`${p.x}:${p.y}`);
  }
}

const round8 = (v: number) => Math.round(v * 1e8) / 1e8;
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

function groupAreas(papers: Paper[]): Area[] {
  const byUri = new Map<string, Area>();
  for (const p of papers) {
    let area = byUri.get(p.areaUri);
    if (!area) {
      area = {
        uri: p.areaUri,
        title: p.area,
        papers: [],
        readers: 0,
        x: 0,
        y: 0,
        r: 0,
      };
      byUri.set(p.areaUri, area);
    }
    area.papers.push(p);
    area.readers += p.internalReaders;
  }
  return [...byUri.values()];
}

/** The same map for another chart size (window resize). */
export function resizeMap(map: ProcessedMap, size: number): ProcessedMap {
  const s = resizeScale(map.size, size);
  for (const p of map.papers) {
    p.x = s(p.x);
    p.y = s(p.y);
    p.diameter = s(p.diameter);
    p.width = s(p.width);
    p.height = s(p.height);
  }
  for (const a of map.areas) {
    a.x = s(a.x);
    a.y = s(a.y);
    a.r = s(a.r);
  }
  map.size = size;
  return map;
}
