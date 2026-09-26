import logger from '@adonisjs/core/services/logger'
import type { DateTime } from 'luxon'
import env from '#start/env'
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

/**
 * Topes duros de la ventana de hora de captura.
 *
 * La configuración de operación se satura a estos intervalos y nunca los rebasa:
 * aflojar más la ventana exige cambiar código y pasar por revisión. La alternativa
 * —dejarla en la configuración de negocio— la volvería pública y ajustable a un año
 * desde una pantalla, que es tanto como volver declarativa la nómina.
 */
export const ASSIST_PUNCH_TIME_MAX_BACKDATE_HOURS_DEFAULT = 72
export const ASSIST_PUNCH_TIME_MAX_BACKDATE_HOURS_MIN = 1
export const ASSIST_PUNCH_TIME_MAX_BACKDATE_HOURS_CAP = 168

/**
 * Tolerancia de hora futura. Arranca en 120 s y no en cero porque un equipo con el
 * desfase normal de reloj perdería todas sus checadas: un rechazo no se encola.
 * Baja a cero cuando el equipo aprenda a corregir su propio reloj.
 */
export const ASSIST_PUNCH_TIME_FUTURE_TOLERANCE_SECONDS_DEFAULT = 120
export const ASSIST_PUNCH_TIME_FUTURE_TOLERANCE_SECONDS_MIN = 0
export const ASSIST_PUNCH_TIME_FUTURE_TOLERANCE_SECONDS_CAP = 300

function saturate(value: number, min: number, max: number, variable: string): number {
  const saturated = Math.min(Math.max(value, min), max)
  if (saturated !== value) {
    logger.warn(
      { variable, configured: value, applied: saturated, min, max },
      'Valor de configuración fuera del intervalo permitido; se aplica el tope de código.'
    )
  }
  return saturated
}

/**
 * Número de configuración, tolerante a que llegue como texto: el esquema de entorno
 * ya lo valida al arrancar, pero un valor puesto en caliente llega crudo.
 */
function readNumber(raw: unknown, fallback: number): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number(raw)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

/** Ventana vigente hacia atrás, en horas, ya saturada al tope del producto. */
export function getAssistPunchTimeMaxBackdateHours(): number {
  return saturate(
    readNumber(
      env.get('ASSIST_PUNCH_TIME_MAX_BACKDATE_HOURS'),
      ASSIST_PUNCH_TIME_MAX_BACKDATE_HOURS_DEFAULT
    ),
    ASSIST_PUNCH_TIME_MAX_BACKDATE_HOURS_MIN,
    ASSIST_PUNCH_TIME_MAX_BACKDATE_HOURS_CAP,
    'ASSIST_PUNCH_TIME_MAX_BACKDATE_HOURS'
  )
}

/** Tolerancia vigente de hora futura, en segundos, ya saturada al tope del producto. */
export function getAssistPunchTimeFutureToleranceSeconds(): number {
  return saturate(
    readNumber(
      env.get('ASSIST_PUNCH_TIME_FUTURE_TOLERANCE_SECONDS'),
      ASSIST_PUNCH_TIME_FUTURE_TOLERANCE_SECONDS_DEFAULT
    ),
    ASSIST_PUNCH_TIME_FUTURE_TOLERANCE_SECONDS_MIN,
    ASSIST_PUNCH_TIME_FUTURE_TOLERANCE_SECONDS_CAP,
    'ASSIST_PUNCH_TIME_FUTURE_TOLERANCE_SECONDS'
  )
}
