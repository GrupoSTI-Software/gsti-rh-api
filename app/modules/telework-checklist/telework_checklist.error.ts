/**
 * Error de dominio de la lista de verificación de teletrabajo
 * (VLRH-H1790812613870).
 *
 * Molde `app/exceptions/telework_policy_error.ts`, pero vive dentro del módulo
 * (censo). El error carga la `key` (slug del título) y, opcionalmente, el
 * `details` accionable que el controller pinta como `data`; el `code` estable
 * (`TWC.*`) lo resuelve el controller con su mapa `key → { status, code }`, así
 * que el dominio no se acopla al HTTP ni al catálogo de códigos.
 */
export type TeleworkChecklistErrorKey =
  | 'respuestas-incompletas'
  | 'respuesta-duplicada'
  | 'punto-no-reconocido'
  | 'fecha-de-aplicacion-invalida'
  | 'visitador-requerido'
  | 'lugar-de-teletrabajo-invalido'
  | 'solo-teletrabajadores'
  | 'colaborador-no-encontrado'
  | 'aplicacion-no-encontrada'
  | 'aplicacion-concurrente'

export default class TeleworkChecklistError extends Error {
  readonly key: TeleworkChecklistErrorKey
  readonly details?: Record<string, unknown>

  constructor(
    key: TeleworkChecklistErrorKey,
    message?: string,
    details?: Record<string, unknown>
  ) {
    super(message ?? key)
    this.name = 'TeleworkChecklistError'
    this.key = key
    this.details = details
  }
}
