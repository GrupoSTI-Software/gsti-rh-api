import { DateTime } from 'luxon'

/**
 * Por que un dia pedido no se registro.
 *
 * El motivo viaja aparte del mensaje porque el cliente decide con el que
 * mostrar: un dia que choca con otra solicitud es informacion util para el
 * colaborador —cambia de fecha y listo—, mientras que un fallo del servidor no
 * es culpa suya y no puede presentarsele como si ya tuviera el permiso pedido.
 * Mientras solo hubo un mensaje en ingles, el cliente no podia distinguirlos.
 */
export type ExceptionRequestErrorReason =
  /** Ya existe una solicitud viva del mismo colaborador para ese dia. */
  | 'duplicate'
  /** La fecha pedida no es interpretable. */
  | 'invalid-date'
  /** El alta fallo por una causa del servidor. */
  | 'error'

interface ExceptionRequestErrorInterface {
  requestedDate: string | null | DateTime
  error: string
  reason?: ExceptionRequestErrorReason
}

export type { ExceptionRequestErrorInterface }
