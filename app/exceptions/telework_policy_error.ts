export type TeleworkPolicyErrorKey =
  | 'politica-ya-existe'
  | 'politica-inexistente'
  | 'estructura-componentes-invalida'
  | 'politica-publicada-inmutable'
  /** Regla de negocio 13: falta contenido en alguno de los 12 componentes al publicar. */
  | 'politica-incompleta-para-publicar'
  /** No hay versión publicada vigente de la cual partir (nuevo borrador) o a la cual recordar. */
  | 'sin-version-vigente'
  /** Regla de negocio 12: ya existe un borrador activo; no se apila otro. */
  | 'borrador-ya-existe'

/**
 * Detalle accionable de por qué el `components` recibido no calza contra los
 * 12 `key` esperados — se expone en la respuesta para que el cliente sepa
 * exactamente qué corregir (faltantes, duplicados o no reconocidos), en vez
 * de un mensaje genérico.
 */
export interface TeleworkPolicyStructureIssues {
  missingKeys: string[]
  duplicatedKeys: string[]
  unexpectedKeys: string[]
}

export default class TeleworkPolicyError extends Error {
  readonly key: TeleworkPolicyErrorKey
  readonly details?: TeleworkPolicyStructureIssues

  constructor(key: TeleworkPolicyErrorKey, message?: string, details?: TeleworkPolicyStructureIssues) {
    super(message ?? key)
    this.name = 'TeleworkPolicyError'
    this.key = key
    this.details = details
  }
}
