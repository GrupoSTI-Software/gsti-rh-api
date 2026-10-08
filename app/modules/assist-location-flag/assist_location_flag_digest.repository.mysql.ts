import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { DatabaseQueryBuilderContract } from '@adonisjs/lucid/types/querybuilder'
import { ASSIST_LOCATION_FLAG } from '#constants/assist_location_flag'
import type {
  AssistLocationFlagDigestRepository,
  AssistLocationFlagPendingRow,
} from './assist_location_flag_digest.repository.js'

interface PendingRawRow {
  assist_id: number
  assist_emp_id: number
  assist_punch_time_utc: Date | string
}

/** La conexión trabaja en UTC (`config/database.ts`): se escribe sin desplazamiento. */
function toSqlUtc(value: DateTime): string {
  return value.toUTC().toSQL({ includeOffset: false })!
}

function toUtcDateTime(value: Date | string): DateTime {
  return value instanceof Date
    ? DateTime.fromJSDate(value, { zone: 'utc' })
    : DateTime.fromSQL(value, { zone: 'utc' })
}

/**
 * Adaptador MySQL del aviso de checadas con ubicación simulada.
 *
 * Solo query builder con la empresa explícita: corre fuera de HTTP, donde el
 * mixin de alcance de los modelos lanza, y `assist.save()` dispararía el hook de
 * llave natural y el `autoUpdate` de `assist_updated_at`. La columna
 * `assist_location_flag_notified_at` no se declara en el modelo `Assist`: solo
 * este adaptador la lee y la escribe.
 */
export default class AssistLocationFlagDigestRepositoryMysql
  implements AssistLocationFlagDigestRepository
{
  /** Predicado "pendiente", común a las tres operaciones. */
  private wherePending(
    query: DatabaseQueryBuilderContract,
    since: DateTime
  ): DatabaseQueryBuilderContract {
    return query
      .where('assist_location_flag', ASSIST_LOCATION_FLAG.SIMULATED)
      .whereNull('assist_location_flag_notified_at')
      .where('assist_active', 1)
      .whereNull('assist_deleted_at')
      .where('assist_created_at', '>=', toSqlUtc(since))
  }

  async findBusinessUnitsWithPending(since: DateTime): Promise<number[]> {
    const rows = (await this.wherePending(db.from('assists'), since)
      .distinct('business_unit_id')
      .orderBy('business_unit_id', 'asc')) as Array<{ business_unit_id: number }>
    return rows.map((row) => Number(row.business_unit_id))
  }

  async claimPending(
    businessUnitId: number,
    since: DateTime,
    limit: number,
    claimedAt: DateTime
  ): Promise<AssistLocationFlagPendingRow[]> {
    return db.transaction(async (trx) => {
      const rows = (await this.wherePending(
        trx.from('assists').where('business_unit_id', businessUnitId),
        since
      )
        .orderBy('assist_punch_time_utc', 'asc')
        .orderBy('assist_id', 'asc')
        .limit(limit)
        .forUpdate()
        .select('assist_id', 'assist_emp_id', 'assist_punch_time_utc')) as PendingRawRow[]

      if (rows.length === 0) return []

      const assistIds = rows.map((row) => Number(row.assist_id))
      const affected = await trx
        .from('assists')
        .where('business_unit_id', businessUnitId)
        .whereIn('assist_id', assistIds)
        .whereNull('assist_location_flag_notified_at')
        .update({ assist_location_flag_notified_at: toSqlUtc(claimedAt) })

      // Otra corrida tomó alguna en medio: no se reclama nada para no mandar
      // ninguna checada en dos correos.
      if (Number(affected) !== assistIds.length) {
        await trx.rollback()
        return []
      }

      return rows.map((row) => ({
        assistId: Number(row.assist_id),
        employeeId: Number(row.assist_emp_id),
        punchTimeUtc: toUtcDateTime(row.assist_punch_time_utc),
      }))
    })
  }

  async releaseClaim(
    businessUnitId: number,
    assistIds: readonly number[],
    claimedAt: DateTime
  ): Promise<void> {
    if (assistIds.length === 0) return

    // Solo lo que reclamó esta corrida: nunca se libera lo que tomó otra.
    await db
      .from('assists')
      .where('business_unit_id', businessUnitId)
      .whereIn('assist_id', [...assistIds])
      .where('assist_location_flag_notified_at', toSqlUtc(claimedAt))
      .update({ assist_location_flag_notified_at: null })
  }
}
