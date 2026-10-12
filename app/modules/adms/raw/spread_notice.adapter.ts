import type { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'
import BiometricTemplate from '#models/biometric_template'
import { ADMS_INCIDENT_KIND } from '#modules/adms/adms.constants'
import IncidentService from './incident.service.js'
import type { SpreadNoticePort } from '#modules/device-commands/evidence/spread_notice.port'

/**
 * Cierra el aviso `fingerprint_not_spread` del equipo donde se capturo la
 * huella en cuanto una copia de ese template queda ejecutada en otro equipo:
 * el operador ya la llevo desde la ficha, y un aviso que sigue abierto cuando
 * su causa ya no existe entrena a la gente a ignorar los avisos.
 */
export default class SpreadNoticeAdapter implements SpreadNoticePort {
  constructor(private readonly incidents: IncidentService = new IncidentService()) {}

  async copyExecuted(biometricTemplateId: number, now: DateTime): Promise<number> {
    try {
      const template = await BiometricTemplate.query()
        .where('biometric_template_id', biometricTemplateId)
        .select('biometric_template_id', 'source_access_point_id')
        .first()
      const sourceAccessPointId = template?.sourceAccessPointId ?? null
      if (sourceAccessPointId === null) return 0
      return await this.incidents.resolveResolvedCause(
        ADMS_INCIDENT_KIND.FINGERPRINT_NOT_SPREAD,
        sourceAccessPointId,
        now
      )
    } catch (error) {
      logger.warn(
        { biometricTemplateId, error: (error as Error).message.slice(0, 200) },
        'canal ADMS: la copia quedo ejecutada pero no se pudo cerrar el aviso de huella sin repartir'
      )
      return 0
    }
  }
}
