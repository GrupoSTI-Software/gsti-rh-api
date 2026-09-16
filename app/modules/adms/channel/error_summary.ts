/**
 * Recorte de errores para el canal ADMS.
 *
 * Knex cuelga `sql` y `bindings` en el objeto de error: volcarlo entero mete la
 * consulta y sus parametros -- que en este canal son PINs, plantillas y datos
 * del colaborador -- en el log y en la columna `error` del crudo, que el BO
 * muestra. Aqui se decide una sola vez que sale y cuanto.
 */

/** Objeto plano para el logger estructurado. */
export function describeError(error: unknown): Record<string, string | undefined> {
  if (!(error instanceof Error)) return { errorName: 'unknown', errorMessage: String(error) }
  const code = (error as { code?: string }).code
  return {
    errorName: error.name,
    errorMessage: error.message.slice(0, 500),
    errorCode: code,
    errorStack: error.stack?.split('\n').slice(0, 5).join('\n'),
  }
}

/** Una linea para guardar junto al crudo o dentro de un incidente. */
export function summarizeError(error: unknown, maxLength = 500): string {
  if (!(error instanceof Error)) return String(error).slice(0, maxLength)
  const code = (error as { code?: string }).code
  const head = code ? `${error.name} [${code}]` : error.name
  return `${head}: ${error.message}`.slice(0, maxLength)
}

/**
 * Solo el tipo, sin el mensaje. El mensaje de MySQL trae los valores de la fila
 * que fallo (`Duplicate entry '1042-2026-09-07 08:03:11' for key ...`); en la
 * columna `error` del crudo eso vive tras la misma barrera que el cuerpo, pero
 * el contexto de un incidente se ve en el BO y no tiene por que llevarlo.
 */
export function errorKind(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown'
  const code = (error as { code?: string }).code
  return code ? `${error.name} [${code}]` : error.name
}
