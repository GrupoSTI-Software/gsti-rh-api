import AccessPointStamp from '#models/access_point_stamp'
import type { StampAdvance, UploadProgressRepository } from './upload_progress.repository.js'

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
}
