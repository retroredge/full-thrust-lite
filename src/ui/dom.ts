type Attributes = Record<string, string | number | boolean | undefined>;
type Child = Node | string | null | undefined;

function apply(element: Element, attributes: Attributes, children: Child[]): void {
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined || value === false) {
      continue;
    }
    element.setAttribute(name, value === true ? '' : String(value));
  }
  for (const child of children) {
    if (child !== null && child !== undefined) {
      element.append(child);
    }
  }
}

/** Creates an HTML element. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Attributes = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  apply(element, attributes, children);
  return element;
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/** Creates an SVG element. */
export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Attributes = {},
  ...children: Child[]
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NAMESPACE, tag);
  apply(element, attributes, children);
  return element;
}

export function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`The page is missing the element "#${id}".`);
  }
  return element as T;
}
