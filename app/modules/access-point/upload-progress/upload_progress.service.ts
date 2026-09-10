import type { DateTime } from 'luxon'
import { ADMS_STAMP_INITIAL, ADMS_STAMP_TABLES } from '#modules/adms/adms.constants'
import { toUploadProgressDto, type UploadProgressDto } from './dto/upload_progress.dto.js'
import UploadProgressRepositoryMysql from './upload_progress.repository.mysql.js'
import type { UploadProgressRepository, UploadProgressRow } from './upload_progress.repository.js'

/**
 * Avance de subida por tabla (spec 4.4). `reset` es la palanca experimental:
 * pone los stamps en `0` y registra quien y cuando. Encolar `check` al equipo
 * llega con la cola de comandos (rebanada 4); hasta entonces el efecto en el
 * checador solo se observa en su siguiente saludo.
 */
export default class UploadProgressService {
  constructor(
    private readonly repository: UploadProgressRepository = new UploadProgressRepositoryMysql()
  ) {}

  async list(accessPointId: number): Promise<UploadProgressDto[]> {
    const rows = await this.repository.listFor(accessPointId)
    const byTable = new Map(rows.map((row) => [row.table, row]))
    return ADMS_STAMP_TABLES.map((table) => {
      const row: UploadProgressRow = byTable.get(table) ?? {
        table,
        value: ADMS_STAMP_INITIAL,
        lastUploadAt: null,
        lastUploadLines: null,
        resetAt: null,
        resetByUserId: null,
      }
      return toUploadProgressDto(row)
    })
  }

  async reset(
    accessPointId: number,
    businessUnitId: number,
    userId: number,
    now: DateTime
  ): Promise<UploadProgressDto[]> {
    await this.repository.resetAll({ accessPointId, businessUnitId, userId, now })
    return this.list(accessPointId)
  }
}
