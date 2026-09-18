/**
 * Rutas de redacción del registro técnico del API (USRH1788551528000).
 *
 * El logger pino (`config/logger.ts`, logger `app`) aplica esta lista a todas las
 * líneas en todos los entornos y en sus dos destinos (`pino/file` y `pino-pretty`).
 * Solo se oculta el valor del campo; la clave se conserva con el censor fijo.
 *
 * Convención de actualización:
 * - Agregar la ruta en este archivo en el mismo PR que introduce el dato sensible
 *   en el registro, bajo la clave `err` (única que pasa por el serializer de pino).
 * - Usar rutas concretas: un `*` por nivel; no usar `**` (pino/fast-redact fallan al arrancar).
 * - Respetar mayúsculas/minúsculas: axios puede escribir `Authorization` o `authorization`.
 * - Probar con `tests/unit/constants/log_redact_paths.spec.ts` sobre la salida real del logger.
 *
 * Qué cubre esta lista:
 * - Credencial y cuerpo enviado en una llamada HTTP saliente fallida (axios).
 * - Consulta y valores de una operación fallida en base de datos (knex / mysql2).
 * - Direcciones rechazadas por el servidor de correo (nodemailer).
 *
 * Qué NO cubre (límites declarados):
 * - Texto embebido en mensajes (`err.message`, `err.stack`, `err.sqlMessage`, respuestas SMTP).
 * - Path o query de la petición entrante (registro del servidor de entrada, fuera de pino).
 * - Escrituras directas a consola (`console.*`).
 * - Datos fuera de las rutas declaradas, aunque sean personales o credenciales.
 *
 * Exclusiones deliberadas (no agregar sin decisión de producto):
 * - `to`, `recipient` de raíz: ya depurados (p. ej. dominio visible en avisos de acceso).
 * - `ip`, `path`, `request_id`: identifican equipos, rutas internas o trazabilidad, no personas.
 * - `err.config.url`, `err.config.method`, `err.response`: diagnóstico de la llamada fallida.
 */
export const LOG_REDACT_PATHS = [
  'err.config.headers.Authorization', // axios: credencial (casing del llamador)
  'err.config.headers.authorization', // axios: credencial en minúsculas
  'err.config.data', // axios: cuerpo enviado
  'err.sql', // mysql2 / knex: consulta
  'err.bindings', // knex: valores de la consulta
  'err.recipient', // nodemailer: destinatario rechazado
  'err.rejected', // nodemailer: direcciones rechazadas
  'err.rejectedErrors', // nodemailer: errores por destinatario
] as const satisfies readonly string[]

/** Valor sustituto fijo; distinto de la máscara de producto (`•`) para no confundir eco y log. */
export const LOG_REDACT_CENSOR = '[Redacted]'

export type LogRedactPath = (typeof LOG_REDACT_PATHS)[number]
