import type { DateTime } from 'luxon'
import { assistChannelSentinel, computeAssistNaturalKey } from '#utils/assist_natural_key'
import type { AssistIngestionRecord } from './dto/assist_ingestion.dto.js'

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

/**
 * Tope de elementos por entrega. Es contrato, vive en código y el cliente no lo
 * cambia: parte sus lotes contra un número estable y publicado.
 *
 * 200 cubre el caso que origina la capacidad —un kiosco de 40 personas tres días
 * sin red, del orden de 480 checadas— en tres entregas. Más alto empujaría el
 * recálculo de calendario de una petición síncrona más allá de lo razonable.
 */
export const ASSIST_INGESTION_BATCH_MAX_ITEMS = 200

/**
 * Tope de tamaño del cuerpo de una entrega: 256 KB, unas cinco veces el peor lote
 * legítimo (200 elementos ≈ 56 KB). El tope global del bodyparser sigue siendo la
 * última red, pero el lote no se conforma con un presupuesto 35 veces mayor del que
 * puede necesitar.
 */
export const ASSIST_INGESTION_BATCH_MAX_BODY_BYTES = 262_144

/**
 * Cuota de checadas por ventana y por usuario. Existe para que el límite del
 * servicio siga contando checadas y no peticiones: sin ella, permitir entregas de
 * 200 multiplicaría por 200 lo que un equipo puede pedir con la misma cuota.
 */
export const ASSIST_INGESTION_BATCH_ITEMS_PER_WINDOW = 1_000
export const ASSIST_INGESTION_BATCH_ITEMS_WINDOW = '5 minutes'

/**
 * Identidad de un registro ya resuelto.
 *
 * Fuente única dentro del módulo: la usan la deduplicación intra-lote del servicio
 * y la clasificación del repositorio. Si cada una la calculara por su cuenta,
 * bastaría un descuido para que buscaran llaves distintas de la que se persiste.
 */
export function assistIngestionNaturalKey(record: AssistIngestionRecord): string {
  return computeAssistNaturalKey({
    businessUnitId: record.businessUnitId,
    assistEmpCode: record.employeeCode,
    assistPunchTimeUtc: record.punchTimeUtc,
    assistTerminalSn: assistChannelSentinel(record.origin, record.terminalSn),
  })
}
