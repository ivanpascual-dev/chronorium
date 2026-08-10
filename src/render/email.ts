import type { SectionSpec } from '../recipe/types.ts';
import { escapeHtml } from './escape.ts';
import { buildStatusLine, type StructuredLine, structureItem } from './item.ts';
import type { Renderer, Report } from './types.ts';

/**
 * Paleta «papel y tinta»: azul marino como color estructural, naranja quemado como único acento.
 * Vive aquí, en el mecanismo, y no en la receta: es aspecto del formato de salida, no dominio.
 * Quien use esto para biotecnología no necesita otros colores; quien quiera otros escribe un cuarto
 * renderizador (contrato `Renderer`) sin tocar este fichero.
 */
const COLOR = {
  paper: '#f6f2eb',
  card: '#ffffff',
  cardAlt: '#fcfaf7',
  ink: '#14202b',
  navy: '#1b4a6b',
  navyDeep: '#12324b',
  orange: '#c25a16',
  body: '#33414e',
  muted: '#6b7a88',
  rule: '#e3dcd1',
  warmTint: '#fbf0e6',
  coolTint: '#eef4f8',
  onDark: '#f3ede3',
  onDarkMuted: '#a8c2d3',
} as const;

// Solo familias presentes en el sistema: una hoja de estilo remota (o una fuente de Google) haría
// que el correo dependiera de un recurso externo, y el correo no depende de nada (RF-F03).
const SERIF = "Georgia, 'Times New Roman', Times, serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Propiedades sueltas, nunca la abreviatura `font:`: el motor de Word que renderiza Outlook la
 * ignora entera, y con ella el tamaño y el color del bloque. */
function textStyle(options: {
  readonly size: number;
  readonly color: string;
  readonly weight?: number;
  readonly lineHeight?: number;
  readonly family?: string;
  readonly letterSpacing?: string;
  readonly upper?: boolean;
}): string {
  const parts = [
    `margin:0`,
    `font-family:${options.family ?? SANS}`,
    `font-size:${options.size}px`,
    `font-weight:${options.weight ?? 400}`,
    `line-height:${options.lineHeight ?? 1.6}`,
    `color:${options.color}`,
  ];
  if (options.letterSpacing !== undefined) {
    parts.push(`letter-spacing:${options.letterSpacing}`);
  }
  if (options.upper === true) {
    parts.push('text-transform:uppercase');
  }
  return `${parts.join(';')};`;
}

/**
 * El tono de cada línea sale de su POSICIÓN declarada, jamás de su nombre ni de su etiqueta (R12):
 * la primera va limpia, y las siguientes alternan cálido y frío. En una sección de tres campos de
 * texto esto pinta «resumen» plano, la opinión sobre naranja y lo accionable sobre azul, sin que el
 * renderizador sepa que existen esos tres conceptos. Con dos campos, o con siete, sigue funcionando.
 */
function accentFor(index: number): { readonly accent: string; readonly tint?: string } {
  if (index === 0) {
    return { accent: COLOR.muted };
  }
  return index % 2 === 1
    ? { accent: COLOR.orange, tint: COLOR.warmTint }
    : { accent: COLOR.navy, tint: COLOR.coolTint };
}

function renderLine(line: StructuredLine, index: number): string {
  const value = `<p style="${textStyle({ size: 14, color: COLOR.body, lineHeight: 1.65 })}">${escapeHtml(line.value)}</p>`;

  if (line.label === undefined) {
    return `<div style="margin:0 0 12px 0;">${value}</div>`;
  }

  const { accent, tint } = accentFor(index);
  const box =
    tint === undefined
      ? 'margin:0 0 12px 0;'
      : `margin:0 0 10px 0;padding:12px 14px;border-radius:4px;background-color:${tint};`;
  const eyebrow =
    `<p style="${textStyle({ size: 10, color: accent, weight: 700, lineHeight: 1.4, letterSpacing: '0.09em', upper: true })}` +
    `margin-bottom:5px;">${escapeHtml(line.label)}</p>`;

  return `<div style="${box}">${eyebrow}${value}</div>`;
}

function renderUrl(url: string): string {
  const safe = escapeHtml(url);
  return (
    `<p style="${textStyle({ size: 12, color: COLOR.navy, lineHeight: 1.5 })}margin-top:8px;word-break:break-all;">` +
    `<a href="${safe}" style="color:${COLOR.navy};text-decoration:underline;">${safe}</a></p>`
  );
}

/**
 * El rótulo del elemento, enlazado si la receta declaró un campo `url`. La flecha final es la única
 * señal de que el titular se puede pulsar: en un cliente de correo no hay estado de ratón que lo
 * revele, y subrayar un titular de dos líneas lo ensucia. Es un glifo, no una palabra, así que no
 * introduce prosa traducible en el mecanismo (T5).
 */
function linkedLabel(label: string, url: string | undefined): string {
  const safeLabel = escapeHtml(label);
  if (url === undefined || safeLabel === '') {
    return safeLabel;
  }
  return (
    `<a href="${escapeHtml(url)}" style="color:${COLOR.navy};text-decoration:none;">${safeLabel}` +
    `<span style="color:${COLOR.orange};white-space:nowrap;">&nbsp;→</span></a>`
  );
}

/** Cardinalidad `list`: cada elemento es una ficha numerada con filete lateral. */
function renderCard(section: SectionSpec, item: Record<string, string>, position: number): string {
  const structured = structureItem(section, item);
  const title = linkedLabel(structured.label, structured.labelUrl);

  const number = String(position).padStart(2, '0');
  const numberHtml = `<p style="${textStyle({ size: 11, color: COLOR.orange, weight: 700, lineHeight: 1.2, letterSpacing: '0.12em' })}margin-bottom:6px;">${number}</p>`;
  const titleHtml = `<p style="${textStyle({ size: 17, color: COLOR.ink, weight: 700, lineHeight: 1.35, family: SERIF })}margin-bottom:12px;">${title}</p>`;

  const lines = structured.lines.map(renderLine).join('');
  const urls = structured.extraUrls.map(renderUrl).join('');

  return (
    `<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:0 0 14px 0;">` +
    `<tr><td bgcolor="${COLOR.cardAlt}" style="background-color:${COLOR.cardAlt};border:1px solid ${COLOR.rule};` +
    `border-left:3px solid ${COLOR.navy};border-radius:4px;padding:18px 20px;">` +
    `${numberHtml}${titleHtml}${lines}${urls}</td></tr></table>`
  );
}

/** Cardinalidad `one`: un bloque editorial con filete, sin ficha ni numeración. */
function renderEditorial(section: SectionSpec, item: Record<string, string>): string {
  const structured = structureItem(section, item);
  const lead =
    structured.label === ''
      ? ''
      : `<p style="${textStyle({ size: 16, color: COLOR.ink, lineHeight: 1.7, family: SERIF })}margin-bottom:10px;">` +
        linkedLabel(structured.label, structured.labelUrl) +
        '</p>';

  const lines = structured.lines.map(renderLine).join('');
  const urls = structured.extraUrls.map(renderUrl).join('');

  return `<div style="border-left:3px solid ${COLOR.orange};padding:2px 0 2px 18px;margin:0 0 6px 0;">${lead}${lines}${urls}</div>`;
}

function renderSection(
  spec: SectionSpec,
  title: string,
  items: readonly Record<string, string>[],
): string {
  const heading =
    `<p style="${textStyle({ size: 20, color: COLOR.ink, weight: 700, lineHeight: 1.3, family: SERIF })}margin-bottom:10px;">${escapeHtml(title)}</p>` +
    `<div style="width:44px;height:2px;font-size:0;line-height:0;background-color:${COLOR.orange};margin:0 0 18px 0;">&nbsp;</div>`;

  const body =
    spec.cardinality === 'one'
      ? items.map((item) => renderEditorial(spec, item)).join('')
      : items.map((item, index) => renderCard(spec, item, index + 1)).join('');

  return `<tr><td style="padding:0 32px 26px 32px;">${heading}${body}</td></tr>`;
}

/** Metadato técnico en tokens, nunca prosa: la misma forma en cualquier idioma de receta (T5). */
function renderFooter(report: Report): string {
  const { provider, providerWasFallback, itemsAnalyzed, itemsCollected, sourcesOk, sourcesFailed } =
    report.meta;
  const tokens = [
    'chronorium',
    `items ${itemsAnalyzed}/${itemsCollected}`,
    `sources ${sourcesOk}/${sourcesOk + sourcesFailed}`,
    `provider ${providerWasFallback ? `${provider} (fallback)` : provider}`,
  ];
  if (report.meta.linksDropped > 0) {
    tokens.push(`links dropped ${report.meta.linksDropped}`);
  }

  return (
    `<tr><td bgcolor="${COLOR.paper}" style="background-color:${COLOR.paper};border-top:1px solid ${COLOR.rule};padding:18px 32px 22px 32px;text-align:center;">` +
    `<p style="${textStyle({ size: 11, color: COLOR.muted, lineHeight: 1.6, letterSpacing: '0.03em' })}">${escapeHtml(tokens.join(' · '))}</p>` +
    `</td></tr>`
  );
}

function renderHeader(report: Report): string {
  const stamp = escapeHtml(`${report.recipe} · ${report.date}`);
  return (
    `<tr><td bgcolor="${COLOR.navyDeep}" style="background-color:${COLOR.navyDeep};padding:26px 32px 24px 32px;">` +
    `<p style="${textStyle({ size: 22, color: COLOR.onDark, weight: 700, lineHeight: 1.2, family: SERIF, letterSpacing: '0.16em', upper: true })}">chronorium</p>` +
    `<p style="${textStyle({ size: 11, color: COLOR.onDarkMuted, lineHeight: 1.5, letterSpacing: '0.1em', upper: true })}margin-top:9px;">${stamp}</p>` +
    `</td></tr>`
  );
}

/** R9: cuando algo va degradado, el estado agregado viaja dentro del propio informe, arriba del
 * todo y en color de aviso, no escondido en un pie que nadie lee. */
function renderStatus(status: string): string {
  return (
    `<tr><td bgcolor="${COLOR.warmTint}" style="background-color:${COLOR.warmTint};border-bottom:1px solid ${COLOR.rule};` +
    `border-left:4px solid ${COLOR.orange};padding:12px 28px;">` +
    `<p style="${textStyle({ size: 12, color: COLOR.orange, weight: 700, lineHeight: 1.5 })}">${escapeHtml(status)}</p></td></tr>`
  );
}

/**
 * Sin ningún recurso externo (ni imagen remota, ni hoja de estilo enlazada): un documento HTML
 * autocontenido. Estilos en línea y maquetación con tablas porque un cliente de correo no es un
 * navegador: Outlook ignora las hojas incrustadas y buena parte de la maquetación moderna.
 * Recorre `sections` por su `key` declarado, nunca por un literal de dominio (R12).
 */
export const emailRenderer: Renderer = {
  format: 'email',
  render(report, sections) {
    const rows: string[] = [renderHeader(report)];

    const status = buildStatusLine(report);
    if (status !== undefined) {
      rows.push(renderStatus(status));
    }

    rows.push(`<tr><td style="height:28px;font-size:0;line-height:0;">&nbsp;</td></tr>`);

    for (const spec of sections) {
      const rendered = report.sections.find((section) => section.key === spec.key);
      if (rendered === undefined) {
        continue;
      }
      rows.push(renderSection(spec, rendered.title, rendered.items));
    }

    rows.push(renderFooter(report));

    const title = escapeHtml(`${report.recipe} · ${report.date}`);

    return (
      '<!doctype html><html><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<meta name="color-scheme" content="light">' +
      '<meta name="supported-color-schemes" content="light">' +
      `<title>${title}</title></head>` +
      `<body style="margin:0;padding:0;background-color:${COLOR.paper};-webkit-font-smoothing:antialiased;">` +
      `<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="${COLOR.paper}" style="background-color:${COLOR.paper};">` +
      '<tr><td align="center" style="padding:24px 12px;">' +
      `<table role="presentation" width="640" border="0" cellspacing="0" cellpadding="0" bgcolor="${COLOR.card}" ` +
      `style="width:100%;max-width:640px;background-color:${COLOR.card};border:1px solid ${COLOR.rule};border-radius:6px;">` +
      rows.join('') +
      '</table></td></tr></table></body></html>'
    );
  },
};
