import type { SectionSpec } from '../recipe/types.ts';
import { escapeMarkdown } from './escape.ts';
import { buildStatusLine, structureItem } from './item.ts';
import type { Renderer } from './types.ts';

function renderItem(section: SectionSpec, item: Record<string, string>): string {
  const structured = structureItem(section, item);
  const label = escapeMarkdown(structured.label);
  const heading =
    structured.labelUrl !== undefined ? `**[${label}](${structured.labelUrl})**` : `**${label}**`;

  const lines = structured.lines.map(({ label: fieldLabel, value }) => {
    const text = escapeMarkdown(value);
    return fieldLabel !== undefined ? `${fieldLabel}: ${text}` : text;
  });

  const extraLinks = structured.extraUrls.map((url) => `<${url}>`);

  return [heading, ...lines, ...extraLinks].join('\n\n');
}

/** Autocontenido y pegable (RF-F02): títulos en encabezados, enlaces visibles en claro. Recorre
 * `sections` por su `key` declarado, nunca por un literal de dominio (R12). */
export const markdownRenderer: Renderer = {
  format: 'markdown',
  render(report, sections) {
    const blocks: string[] = [];

    const status = buildStatusLine(report);
    if (status !== undefined) {
      blocks.push(`> ${status}`);
    }

    for (const spec of sections) {
      const rendered = report.sections.find((section) => section.key === spec.key);
      if (rendered === undefined) {
        continue;
      }
      const heading = `## ${escapeMarkdown(rendered.title)}`;
      const items = rendered.items.map((item) => renderItem(spec, item));
      blocks.push([heading, ...items].join('\n\n'));
    }

    return blocks.join('\n\n');
  },
};
