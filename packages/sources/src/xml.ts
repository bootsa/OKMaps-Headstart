/**
 * A small XML reader for provider responses (PubMed, OpenAIRE, BASE).
 *
 * It has no dependencies because DOMParser is missing in Web Workers and in
 * Node. It reads well-formed XML into a plain tree and drops whitespace-only
 * text the way libxml2 does with xml2's default NOBLANKS option, so that
 * `textOf` matches R's `xml2::xml_text`, which the R data clients use.
 * It does not validate, resolve external entities, or keep comments.
 */

export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  parent: XmlElement | null;
}

export type XmlNode = XmlElement | string;

const PREDEFINED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodeEntities(s: string): string {
  if (!s.includes("&")) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9._-]*);/g, (m, ref: string) => {
    if (ref[0] === "#") {
      const code = ref[1] === "x" || ref[1] === "X" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return PREDEFINED[ref] ?? m;
  });
}

const isBlank = (s: string) => /^[ \t\n\r]*$/.test(s);

export class XmlParseError extends Error {}

/** Parses a document and returns its root element. */
export function parseXml(input: string): XmlElement {
  const src = input.replace(/\r\n?/g, "\n");
  const n = src.length;
  let i = 0;
  let root: XmlElement | null = null;
  let current: XmlElement | null = null;
  // Whether the last child appended to `current` is a text node made from
  // character data (so following whitespace is kept, as in libxml2).
  // CDATA sections are kept as text but, as in libxml2, they are not text
  // nodes for the whitespace rule.
  const lastIsCdata = new WeakSet<XmlElement>();
  const firstIsCdata = new WeakSet<XmlElement>();
  const lastIsText = (el: XmlElement) =>
    typeof el.children[el.children.length - 1] === "string" && !lastIsCdata.has(el);
  const firstIsText = (el: XmlElement) => typeof el.children[0] === "string" && !firstIsCdata.has(el);
  const appendText = (el: XmlElement, text: string) => {
    if (text === "") return;
    const last = el.children.length - 1;
    if (last >= 0 && lastIsText(el)) el.children[last] = (el.children[last] as string) + text;
    else el.children.push(text);
    lastIsCdata.delete(el);
  };

  while (i < n) {
    if (src[i] !== "<") {
      let j = src.indexOf("<", i);
      if (j < 0) j = n;
      const raw = src.slice(i, j);
      if (current) {
        // libxml2 areBlanks(): a whitespace-only run that ends at a tag is
        // dropped unless it is the only content of its element, or the
        // element already holds text (mixed content).
        const keep =
          !isBlank(raw) ||
          raw.includes("&") ||
          (current.children.length === 0 && src.startsWith("</", j)) ||
          lastIsText(current) ||
          firstIsText(current);
        if (keep) appendText(current, decodeEntities(raw));
      }
      i = j;
      continue;
    }
    if (src.startsWith("<?", i)) {
      const j = src.indexOf("?>", i);
      if (j < 0) throw new XmlParseError("unterminated processing instruction");
      i = j + 2;
    } else if (src.startsWith("<!--", i)) {
      const j = src.indexOf("-->", i);
      if (j < 0) throw new XmlParseError("unterminated comment");
      i = j + 3;
    } else if (src.startsWith("<![CDATA[", i)) {
      const j = src.indexOf("]]>", i);
      if (j < 0) throw new XmlParseError("unterminated CDATA section");
      if (current) {
        if (current.children.length === 0) firstIsCdata.add(current);
        current.children.push(src.slice(i + 9, j));
        lastIsCdata.add(current);
      }
      i = j + 3;
    } else if (src.startsWith("<!", i)) {
      // DOCTYPE, possibly with an internal subset in brackets.
      let depth = 0;
      let j = i + 2;
      for (; j < n; j++) {
        const c = src[j];
        if (c === "[") depth++;
        else if (c === "]") depth--;
        else if (c === ">" && depth <= 0) break;
      }
      i = j + 1;
    } else if (src[i + 1] === "/") {
      const j = src.indexOf(">", i);
      if (j < 0) throw new XmlParseError("unterminated end tag");
      const name = src.slice(i + 2, j).trim();
      if (!current || current.name !== name) throw new XmlParseError(`unexpected </${name}>`);
      current = current.parent;
      i = j + 1;
    } else {
      // Start tag: name, attributes, optional self-closing slash.
      let j = i + 1;
      while (j < n && !/[\s/>]/.test(src[j])) j++;
      const name = src.slice(i + 1, j);
      const attrs: Record<string, string> = {};
      for (;;) {
        while (j < n && /\s/.test(src[j])) j++;
        if (j >= n) throw new XmlParseError("unterminated start tag");
        if (src[j] === ">" || src.startsWith("/>", j)) break;
        let k = j;
        while (k < n && !/[\s=/>]/.test(src[k])) k++;
        const attr = src.slice(j, k);
        while (k < n && /\s/.test(src[k])) k++;
        if (src[k] !== "=") throw new XmlParseError(`attribute ${attr} has no value`);
        k++;
        while (k < n && /\s/.test(src[k])) k++;
        const quote = src[k];
        if (quote !== '"' && quote !== "'") throw new XmlParseError(`attribute ${attr} is not quoted`);
        const end = src.indexOf(quote, k + 1);
        if (end < 0) throw new XmlParseError("unterminated attribute value");
        attrs[attr] = decodeEntities(src.slice(k + 1, end).replace(/[\t\n]/g, " "));
        j = end + 1;
      }
      const selfClosing = src[j] === "/";
      const el: XmlElement = { name, attrs, children: [], parent: current };
      if (current) {
        current.children.push(el);
        lastIsCdata.delete(current);
      }
      else if (!root) root = el;
      else throw new XmlParseError("more than one root element");
      if (!selfClosing) current = el;
      i = j + (selfClosing ? 2 : 1);
    }
  }
  if (!root) throw new XmlParseError("no root element");
  if (current) throw new XmlParseError(`unclosed <${current.name}>`);
  return root;
}

/** Element children (R: xml_children). */
export function childElements(el: XmlElement): XmlElement[] {
  return el.children.filter((c): c is XmlElement => typeof c !== "string");
}

/** All text below the element, concatenated (R: xml_text). */
export function textOf(el: XmlElement): string {
  let out = "";
  for (const c of el.children) out += typeof c === "string" ? c : textOf(c);
  return out;
}

function* descendants(el: XmlElement): Generator<XmlElement> {
  for (const c of el.children) {
    if (typeof c === "string") continue;
    yield c;
    yield* descendants(c);
  }
}

interface Step {
  name: string;
  attr?: [string, string];
}

const pathCache = new Map<string, Step[]>();

function compile(path: string): Step[] {
  let steps = pathCache.get(path);
  if (steps) return steps;
  if (!path.startsWith(".//")) throw new Error(`unsupported path ${path}`);
  steps = path
    .slice(3)
    .split("/")
    .map((s) => {
      const m = /^([A-Za-z_][\w.:-]*)(?:\[@([\w.-]+)=["']([^"']*)["']\])?$/.exec(s);
      if (!m) throw new Error(`unsupported path step ${s}`);
      return m[2] ? { name: m[1], attr: [m[2], m[3]] as [string, string] } : { name: m[1] };
    });
  pathCache.set(path, steps);
  return steps;
}

const matches = (el: XmlElement, step: Step) =>
  el.name === step.name && (!step.attr || el.attrs[step.attr[0]] === step.attr[1]);

/**
 * Elements matching a path of the form `.//A/B[@k="v"]/C`, below `context`
 * and in document order (R: xml_find_all with the same XPath).
 */
export function findAll(context: XmlElement, path: string): XmlElement[] {
  const steps = compile(path);
  const out: XmlElement[] = [];
  const last = steps[steps.length - 1];
  for (const el of descendants(context)) {
    if (!matches(el, last)) continue;
    let node: XmlElement | null = el;
    let ok = true;
    for (let s = steps.length - 2; s >= 0; s--) {
      node = node.parent;
      if (!node || node === context || !matches(node, steps[s])) {
        ok = false;
        break;
      }
    }
    // The first step must itself sit strictly below the context.
    if (ok && node && node !== context && isBelow(node, context)) out.push(el);
  }
  return out;
}

function isBelow(el: XmlElement, ancestor: XmlElement): boolean {
  for (let p = el.parent; p; p = p.parent) if (p === ancestor) return true;
  return false;
}

/** First match or null (R: xml_find_first). */
export function findFirst(context: XmlElement, path: string): XmlElement | null {
  return findAll(context, path)[0] ?? null;
}
