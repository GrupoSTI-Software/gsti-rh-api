import AccessPoint from '#models/access_point'
import BusinessUnit from '#models/business_unit'
import type { UploadContextRepository } from './upload_context.repository.js'

/**
 * Adaptador Lucid del contexto de subida. Corre dentro del
 * `TenantContext.run([businessUnitId])` que abre la pasarela, igual que el
 * resto del canal.
 */
export default class UploadContextRepositoryMysql implements UploadContextRepository {
  async accessPointName(accessPointId: number): Promise<string> {
    const accessPoint = await AccessPoint.query().where('access_point_id', accessPointId).first()
    return accessPoint?.accessPointName ?? ''
  }

  async businessUnitTimezone(businessUnitId: number): Promise<string | null> {
    const businessUnit = await BusinessUnit.query()
      .where('business_unit_id', businessUnitId)
      .first()
    return businessUnit?.businessUnitTimezone ?? null
  }
}
