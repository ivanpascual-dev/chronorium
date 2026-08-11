import nodemailer from 'nodemailer';
import type { RenderedReport } from '../render/types.ts';
import { redactSecrets } from './secrets.ts';
import type { DeliverContext, Notifier, NotifierConfig } from './types.ts';

export interface MailMessage {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

/** Mínimo deliberado (R13): lo justo para doblarlo en un test sin arrastrar el transporte real de
 * `nodemailer`, igual que `FetchLike` en `sources/types.ts`. */
export interface MailTransport {
  sendMail(message: MailMessage): Promise<unknown>;
}

export interface SmtpConfig {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly auth: { readonly user: string; readonly pass: string };
  /** Los dos tiempos de espera de la fase de conexión. Sin declararlos, el transporte espera **dos
   * minutos** antes de rendirse, así que un puerto equivocado o una salida cortada no se distingue
   * de "el modelo tardó": la ejecución simplemente se para. Con el tiempo de espera del resto del
   * sistema, ese caso falla rápido y con nombre. El envío en sí conserva el suyo por defecto: el
   * cuerpo de un informe no viaja en diez segundos garantizados. */
  readonly connectionTimeout: number;
  readonly greetingTimeout: number;
}

export type TransportFactory = (config: SmtpConfig) => MailTransport;

const REQUIRED_SECRETS: readonly string[] = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASSWORD',
];

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Ningún campo derivado de la receta o del informe llega a una cabecera de correo sin pasar por
 * aquí (ADR-020): un `\r`/`\n` ahí es el mecanismo exacto de varios avisos de seguridad recientes
 * de `nodemailer` sobre inyección en cabeceras MIME. Se corrige en código, no se confía solo en el
 * saneado interno de la librería (R2).
 */
function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n\0]/g, ' ');
}

function defaultTransportFactory(config: SmtpConfig): MailTransport {
  // Transporte genérico, no el atajo `service: 'gmail'` (ADR-020): el notificador no debe conocer
  // qué proveedor SMTP usa el operador. Nunca `raw` a nivel de mensaje ni `jsonTransport`.
  return nodemailer.createTransport(config);
}

/**
 * Fábrica que acepta el transporte inyectado (por defecto, `nodemailer`), igual que
 * `ProviderFactory` en la fase 3 (R10): permite que los tests no toquen la red sin que el flujo
 * real tenga un camino distinto.
 */
export function makeEmailNotifier(
  transportFactory: TransportFactory = defaultTransportFactory,
): Notifier {
  return {
    id: 'email',
    requiredSecrets: REQUIRED_SECRETS,
    async send(rendered: RenderedReport, cfg: NotifierConfig, ctx: DeliverContext): Promise<void> {
      const host = ctx.secret('SMTP_HOST');
      const portRaw = ctx.secret('SMTP_PORT');
      const user = ctx.secret('SMTP_USER');
      const pass = ctx.secret('SMTP_PASSWORD');
      if (host === undefined || portRaw === undefined || user === undefined || pass === undefined) {
        throw new Error(
          'faltan credenciales SMTP (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD)',
        );
      }

      const to = typeof cfg.to === 'string' ? cfg.to : undefined;
      const from = typeof cfg.from === 'string' ? cfg.from : undefined;
      if (to === undefined || from === undefined) {
        throw new Error('el canal "email" exige "to" y "from" declarados en la receta');
      }

      const port = Number(portRaw);
      if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        throw new Error(`SMTP_PORT no es un número de puerto: "${portRaw}"`);
      }
      const secure = port === 465;
      const transport = transportFactory({
        host,
        port,
        secure,
        auth: { user, pass },
        connectionTimeout: ctx.timeoutMs,
        greetingTimeout: ctx.timeoutMs,
      });

      try {
        await transport.sendMail({
          from: sanitizeHeaderValue(from),
          to,
          subject: sanitizeHeaderValue(rendered.subject),
          text: rendered.markdown,
          html: rendered.html,
        });
      } catch (cause) {
        throw new Error(redactSecrets(errorMessage(cause), [pass, user]));
      }
    },
  };
}

export const emailNotifier: Notifier = makeEmailNotifier();
