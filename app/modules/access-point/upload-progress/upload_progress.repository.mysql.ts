import AccessPointStamp from '#models/access_point_stamp'
import { ADMS_STAMP_INITIAL, ADMS_STAMP_TABLES } from '#modules/adms/adms.constants'
import type {
  StampAdvance,
  StampReset,
  UploadProgressRepository,
  UploadProgressRow,
} from './upload_progress.repository.js'

function toRow(model: AccessPointStamp): UploadProgressRow {
  return {
    table: model.accessPointStampTable,
    value: model.accessPointStampValue,
    lastUploadAt: model.accessPointStampLastUploadAt ?? null,
    lastUploadLines: model.accessPointStampLastUploadLines ?? null,
    resetAt: model.accessPointStampResetAt ?? null,
    resetByUserId: model.accessPointStampResetByUserId ?? null,
  }
}

/** Adaptador Lucid de stamps. Una fila por (dispositivo, tabla). */
export default class UploadProgressRepositoryMysql implements UploadProgressRepository {
  async stampsFor(accessPointId: number): Promise<Record<string, string>> {
    const rows = await AccessPointStamp.query().where('access_point_id', accessPointId)
    const stamps: Record<string, string> = {}
    for (const row of rows) stamps[row.accessPointStampTable] = row.accessPointStampValue
    return stamps
  }

  async advance(input: StampAdvance): Promise<void> {
    const existing = await AccessPointStamp.query()
      .where('access_point_id', input.accessPointId)
      .where('access_point_stamp_table', input.table)
      .first()
    if (existing) {
      existing.accessPointStampValue = input.value
      existing.accessPointStampLastUploadAt = input.now
      existing.accessPointStampLastUploadLines = input.lines
      await existing.save()
      return
    }
    const stamp = new AccessPointStamp()
    stamp.accessPointId = input.accessPointId
    stamp.businessUnitId = input.businessUnitId
    stamp.accessPointStampTable = input.table
    stamp.accessPointStampValue = input.value
    stamp.accessPointStampLastUploadAt = input.now
    stamp.accessPointStampLastUploadLines = input.lines
    await stamp.save()
  }

  async listFor(accessPointId: number): Promise<UploadProgressRow[]> {
    const rows = await AccessPointStamp.query()
      .where('access_point_id', accessPointId)
      .orderBy('access_point_stamp_table', 'asc')
    return rows.map(toRow)
  }

  /** Deja una fila en `0` por cada tabla del saludo, aunque no existiera. */
  async resetAll(input: StampReset): Promise<void> {
    const existing = await AccessPointStamp.query().where('access_point_id', input.accessPointId)
    const byTable = new Map(existing.map((row) => [row.accessPointStampTable, row]))
    for (const table of ADMS_STAMP_TABLES) {
      const row = byTable.get(table) ?? new AccessPointStamp()
      if (!byTable.has(table)) {
        row.accessPointId = input.accessPointId
        row.businessUnitId = input.businessUnitId
        row.accessPointStampTable = table
      }
      row.accessPointStampValue = ADMS_STAMP_INITIAL
      row.accessPointStampResetAt = input.now
      row.accessPointStampResetByUserId = input.userId
      await row.save()
    }
  }
}
