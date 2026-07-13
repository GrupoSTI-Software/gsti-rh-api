export type TeleworkPolicyErrorKey =
  | 'politica-ya-existe'
  | 'politica-inexistente'
  | 'estructura-componentes-invalida'
  | 'politica-publicada-inmutable'

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
