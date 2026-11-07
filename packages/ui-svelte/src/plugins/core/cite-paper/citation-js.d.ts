// citation-js ships no types: the parts this package uses.
declare module "@citation-js/core" {
	export class Cite {
		constructor(data: unknown);
		format(type: "bibliography", options: { template: string; format?: string; lang?: string }): string;
	}
	export const plugins: {
		config: { get(name: "@csl"): { templates: { add(name: string, csl: string): void } } };
	};
}

declare module "@citation-js/plugin-csl";
