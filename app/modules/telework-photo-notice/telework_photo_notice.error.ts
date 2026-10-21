/**
 * Error de dominio del aviso de privacidad de la evidencia fotográfica del
 * puesto de trabajo (VLRH-H1791306079310, §10).
 *
 * Molde `app/modules/telework-checklist/telework_checklist.error.ts`: el error
 * carga la `key` (slug del título) y, opcionalmente, el `details` accionable
 * que el controller pinta como `data`. El `code` estable (`TWN.*`) y el status
 * HTTP los resuelve el controller con su mapa `key → { status, code }` (Tarea
 * 4), así que el dominio no se acopla al HTTP ni al catálogo de códigos.
 *
 * Claves de esta tarea (lecturas y ciclo del borrador) más las dos que agrega
 * el `publish` de la Tarea 3 (`marcador-no-reconocido` y `contenido-vacio`):
 * con las seis, el controller de la Tarea 4 arma su mapa completo.
 *
 * `aviso-no-publicado` es el 404 fallo-cerrado del alcance no resuelto
 * (`businessUnitId <= 0`, cross-tenant) y del colaborador inválido.
 */
export type TeleworkPhotoNoticeErrorKey =
  | 'aviso-no-publicado'
  | 'borrador-ya-existe'
  | 'borrador-no-encontrado'
  | 'plantilla-no-encontrada'

export default class TeleworkPhotoNoticeError extends Error {
  readonly key: TeleworkPhotoNoticeErrorKey
  readonly details?: Record<string, unknown>

  constructor(
    key: TeleworkPhotoNoticeErrorKey,
    message?: string,
    details?: Record<string, unknown>
  ) {
    super(message ?? key)
    this.name = 'TeleworkPhotoNoticeError'
    this.key = key
    this.details = details
  }
}
