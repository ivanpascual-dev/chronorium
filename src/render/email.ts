import type { SectionSpec } from '../recipe/types.ts';
import { escapeHtml } from './escape.ts';
import { buildStatusLine, structureItem } from './item.ts';
import type { Renderer } from './types.ts';

function renderItem(section: SectionSpec, item: Record<string, string>): string {
  const structured = structureItem(section, item);
  const label = escapeHtml(structured.label);
  const heading =
    structured.labelUrl !== undefined
      ? `<p><strong><a href="${escapeHtml(structured.labelUrl)}">${label}</a></strong></p>`
      : `<p><strong>${label}</strong></p>`;

  const lines = structured.lines.map(({ label: fieldLabel, value }) => {
    const text = escapeHtml(value);
    return fieldLabel !== undefined
      ? `<p><strong>${escapeHtml(fieldLabel)}:</strong> ${text}</p>`
      : `<p>${text}</p>`;
  });

  const extraLinks = structured.extraUrls.map((url) => {
    const safeUrl = escapeHtml(url);
    return `<p><a href="${safeUrl}">${safeUrl}</a></p>`;
  });

  return [heading, ...lines, ...extraLinks].join('\n');
}

/** Sin ningún recurso externo (ni imagen remota, ni hoja de estilo enlazada): un documento HTML
 * autocontenido. Recorre `sections` por su `key` declarado, nunca por un literal de dominio (R12). */
export const emailRenderer: Renderer = {
  format: 'email',
  render(report, sections) {
    const parts: string[] = [];

    const status = buildStatusLine(report);
    if (status !== undefined) {
      parts.push(`<blockquote>${escapeHtml(status)}</blockquote>`);
    }

    for (const spec of sections) {
      const rendered = report.sections.find((section) => section.key === spec.key);
      if (rendered === undefined) {
        continue;
      }
      const heading = `<h2>${escapeHtml(rendered.title)}</h2>`;
      const items = rendered.items.map((item) => renderItem(spec, item)).join('\n');
      parts.push(`${heading}\n${items}`);
    }

    return `<!doctype html><html><body>${parts.join('\n')}</body></html>`;
  },
};
