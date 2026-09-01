import Assist from '#models/assist'
import { resolveAssistBusinessUnitId } from '#helpers/assist_business_unit_guard'
import { ASSIST_NATURAL_KEY_INDEX, computeAssistNaturalKey } from '#utils/assist_natural_key'
import type { AssistIngestionRepository } from './assist_ingestion.repository.js'
import type {
  AssistIngestionPersisted,
  AssistIngestionRecord,
} from './dto/assist_ingestion.dto.js'

/** `ER_DUP_ENTRY` sobre el índice de la llave natural. Cualquier otro duplicado no es nuestro. */
function isNaturalKeyDuplicate(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false
  const dbError = error as { code?: string; sqlMessage?: string }
  return (
    dbError.code === 'ER_DUP_ENTRY' &&
    dbError.sqlMessage?.includes(ASSIST_NATURAL_KEY_INDEX) === true
  )
}

/**
 * Implementación Lucid del motor de ingesta. **Único punto del módulo que toca Lucid.**
 *
 * Se escribe por instancia del modelo y no por `INSERT ... ON DUPLICATE KEY`: el
 * query builder no instancia el modelo y no dispararía los hooks que asignan la
 * empresa ni la llave natural.
 */
export default class AssistIngestionRepositoryMysql implements AssistIngestionRepository {
  async ingestMany(records: AssistIngestionRecord[]): Promise<AssistIngestionPersisted[]> {
    if (records.length === 0) return []

    // 1. Llave natural por registro. Nunca se reimplementa el algoritmo.
    const keyed = records.map((record) => ({
      record,
      naturalKey: computeAssistNaturalKey({
        businessUnitId: record.businessUnitId,
        assistEmpCode: record.employeeCode,
        assistPunchTimeUtc: record.punchTimeUtc,
        assistTerminalSn: record.terminalSn,
      }),
    }))

    // 2. Una sola consulta de clasificación para todo el arreglo. `.withTrashed()` es
    //    obligatorio: el UNIQUE no incluye `assist_deleted_at`, así que una fila
    //    borrada lógicamente sigue ocupando su llave y su reenvío es `preexisting`.
    const existing = await Assist.query()
      .withTrashed()
      .whereIn(
        'assist_natural_key',
        keyed.map((entry) => entry.naturalKey)
      )

    const byNaturalKey = new Map<string, Assist>()
    for (const row of existing) {
      if (row.assistNaturalKey) byNaturalKey.set(row.assistNaturalKey, row)
    }

    const persisted: AssistIngestionPersisted[] = []

    for (const { record, naturalKey } of keyed) {
      const alreadyThere = byNaturalKey.get(naturalKey)
      if (alreadyThere) {
        persisted.push({ index: record.index, outcome: 'preexisting', assist: alreadyThere })
        continue
      }

      try {
        // 3. Los no encontrados se insertan uno a uno, por instancia del modelo.
        const assist = await this.insert(record)
        byNaturalKey.set(naturalKey, assist)
        persisted.push({ index: record.index, outcome: 'inserted', assist })
      } catch (error) {
        // 4. El índice es el árbitro: la colisión se reclasifica, no revienta.
        if (!isNaturalKeyDuplicate(error)) throw error
        const winner = await Assist.query()
          .withTrashed()
          .where('assist_natural_key', naturalKey)
          .firstOrFail()
        byNaturalKey.set(naturalKey, winner)
        persisted.push({ index: record.index, outcome: 'preexisting', assist: winner })
      }
    }

    return persisted
  }

  /** Alta de una checada nueva. No asigna `assist_created_at`: es el testigo de llegada. */
  private async insert(record: AssistIngestionRecord): Promise<Assist> {
    const assist = new Assist()

    // Empresa explícita y fail-closed: no se delega al hook ni al mixin (regla 5).
    assist.businessUnitId = resolveAssistBusinessUnitId(record.businessUnitId)
    assist.assistEmpId = record.employeeId
    assist.assistEmpCode = record.employeeCode
    assist.assistTerminalSn = record.terminalSn
    assist.assistTerminalAlias = ''
    assist.assistAreaAlias = ''
    assist.assistTerminalId = null
    assist.assistSyncId = 0
    if (record.assistType !== null) assist.assistType = record.assistType
    assist.assistOrigin = record.origin
    assist.assistCreatedByUserId = record.createdByUserId

    if (record.geo.latitude !== null) assist.assistLatitude = record.geo.latitude
    if (record.geo.longitude !== null) assist.assistLongitude = record.geo.longitude
    if (record.geo.precision !== null) assist.assistPrecision = record.geo.precision

    assist.assistPunchTime = record.punchTimeUtc
    assist.assistPunchTimeUtc = record.punchTimeUtc
    assist.assistPunchTimeOrigin = record.punchTimeUtc
    assist.assistUploadTime = record.punchTimeUtc

    await assist.save()
    return assist
  }
}
