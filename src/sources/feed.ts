import type { XmlElement } from '@rgrove/parse-xml';
import { parseXml } from '@rgrove/parse-xml';
import { fetchWithTimeout } from './http.ts';
import type { Item, SourceReader } from './types.ts';
import { makeItem } from './types.ts';

function isElement(node: { readonly type: string }): node is XmlElement {
  return node.type === 'element';
}

function children(element: XmlElement, name: string): XmlElement[] {
  return element.children.filter((node) => isElement(node) && node.name === name) as XmlElement[];
}

function child(element: XmlElement, name: string): XmlElement | undefined {
  return children(element, name)[0];
}

function text(element: XmlElement | undefined): string | undefined {
  const value = element?.text.trim();
  return value !== undefined && value.length > 0 ? value : undefined;
}

/** RSS 2.0: `channel > item`, con `pubDate` en formato RFC 822. */
function parseRss(root: XmlElement, source: string): Item[] {
  const channel = child(root, 'channel');
  if (!channel) {
    return [];
  }

  return children(channel, 'item').flatMap((itemEl): Item[] => {
    const title = text(child(itemEl, 'title'));
    const url = text(child(itemEl, 'link'));
    if (title === undefined || url === undefined) {
      return [];
    }

    return [
      makeItem({
        title,
        url,
        source,
        summary: text(child(itemEl, 'description')) ?? '',
        publishedAt: text(child(itemEl, 'pubDate')),
      }),
    ];
  });
}

/** Atom: `feed > entry`, con `link[href]` (sin texto) y `published`/`updated` en ISO. */
function parseAtom(root: XmlElement, source: string): Item[] {
  return children(root, 'entry').flatMap((entry): Item[] => {
    const title = text(child(entry, 'title'));
    const url = child(entry, 'link')?.attributes.href;
    if (title === undefined || url === undefined) {
      return [];
    }

    return [
      makeItem({
        title,
        url,
        source,
        summary: text(child(entry, 'summary')) ?? text(child(entry, 'content')) ?? '',
        publishedAt: text(child(entry, 'published')) ?? text(child(entry, 'updated')),
      }),
    ];
  });
}

export const feedReader: SourceReader = {
  type: 'feed',
  requiredSecrets: [],
  async read(source, ctx) {
    if (source.url === undefined) {
      throw new Error(`la fuente "${source.id}" de tipo feed no declara "url"`);
    }

    const response = await fetchWithTimeout(source.url, ctx);
    if (!response.ok) {
      throw new Error(`${source.url} respondió ${response.status}`);
    }

    const body = await response.text();
    const document = parseXml(body);
    const root = document.root;
    if (!root) {
      return [];
    }

    if (root.name === 'rss') {
      return parseRss(root, source.id);
    }
    if (root.name === 'feed') {
      return parseAtom(root, source.id);
    }

    throw new Error(`formato de canal desconocido en ${source.url}: elemento raíz "${root.name}"`);
  },
};
