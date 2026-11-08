/**
 * Form fields as data, so a module (a metadata source, a store type) can
 * describe its form without shipping a component. Fields.svelte draws them.
 */

export type FieldValue = string | string[];
export type FieldValues = Record<string, FieldValue>;

export interface FieldOption {
	value: string;
	label: string;
}

export interface FieldSpec {
	name: string;
	label: string;
	kind: "text" | "search" | "url" | "password" | "date" | "select" | "checkboxes" | "textarea" | "number";
	required?: boolean;
	placeholder?: string;
	hint?: string;
	/** For select and checkboxes. */
	options?: FieldOption[];
	/** The starting value (checkboxes: the values ticked). */
	default?: FieldValue | (() => FieldValue);
	autocomplete?: HTMLInputElement["autocomplete"];
	/** Suggestions offered while typing (a datalist). */
	suggestions?: string[];
	/** Fields with the same row sit side by side on wide screens. */
	row?: string;
	/** Consecutive fields with the same section are folded under its name (closed at first). */
	section?: string;
	/** Lines of a textarea. */
	lines?: number;
	/** Monospaced text (code, queries). */
	code?: boolean;
}

/** The starting values of a form. */
export function defaultValues(fields: FieldSpec[], current: FieldValues = {}): FieldValues {
	const values: FieldValues = {};
	for (const f of fields) {
		const d = typeof f.default === "function" ? f.default() : f.default;
		const v =
			current[f.name] ?? d ?? (f.kind === "checkboxes" ? [] : f.kind === "select" ? (f.options?.[0]?.value ?? "") : "");
		// Kept as text ("a,b", see textValues), ticked boxes again.
		values[f.name] = f.kind === "checkboxes" && typeof v === "string" ? v.split(",").filter(Boolean) : v;
	}
	return values;
}

/** The labels of required fields left empty. */
export function missingFields(fields: FieldSpec[], values: FieldValues): string[] {
	return fields
		.filter((f) => f.required)
		.filter((f) => {
			const v = values[f.name];
			return Array.isArray(v) ? v.length === 0 : !String(v ?? "").trim();
		})
		.map((f) => f.label);
}

/** A field's value as text (trimmed; checkboxes joined by commas). */
export function text(values: FieldValues, name: string): string {
	const v = values[name];
	return Array.isArray(v) ? v.join(",") : String(v ?? "").trim();
}

/** Text values only, as a store's config keeps them. */
export function textValues(fields: FieldSpec[], values: FieldValues): Record<string, string> {
	return Object.fromEntries(
		fields.map((f) => [f.name, f.kind === "password" ? String(values[f.name] ?? "") : text(values, f.name)]),
	);
}
