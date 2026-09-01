import type { DateTime } from 'luxon'

/**
 * Umbral de retraso de llegada de una checada, en segundos.
 *
 * Dos minutos es el margen que absorbe el desfase natural del reloj de los equipos:
 * por debajo de él la checada llegó cuando tenía que llegar; por encima, llegó
 * diferida porque el equipo estuvo sin conexión.
 */
export const ASSIST_INGESTION_DEFERRED_THRESHOLD_SECONDS = 120

/**
 * Segundos transcurridos entre el marcaje y su llegada al servidor.
 * Negativo si el reloj del equipo de origen va adelantado respecto del servidor.
 */
export function assistArrivalDelayInSeconds(punchTimeUtc: DateTime, arrivedAt: DateTime): number {
  return Math.round(arrivedAt.toUTC().diff(punchTimeUtc.toUTC(), 'seconds').seconds)
}

/** Predicado puro: la checada llegó con retraso respecto del instante en que ocurrió. */
export function isAssistArrivalDeferred(punchTimeUtc: DateTime, arrivedAt: DateTime): boolean {
  return assistArrivalDelayInSeconds(punchTimeUtc, arrivedAt) > ASSIST_INGESTION_DEFERRED_THRESHOLD_SECONDS
}
