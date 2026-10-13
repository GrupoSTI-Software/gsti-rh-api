import type { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'
import BiometricTemplate from '#models/biometric_template'
import AccessPointEmployee from '#models/access_point_employee'
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
        .select('biometric_template_id', 'source_access_point_id', 'employee_id', 'biometric_template_bio_no')
        .first()
      const sourceAccessPointId = template?.sourceAccessPointId ?? null
      if (!template || sourceAccessPointId === null) return 0
      /**
       * El aviso es por PIN y dedo: se cierra solo el de esta persona y este
       * dedo, no todos los del equipo. El PIN vive en el vinculo del colaborador
       * con el equipo de origen; sin vinculo no hay aviso que cerrar.
       */
      const pivot = await AccessPointEmployee.query()
        .where('access_point_id', sourceAccessPointId)
        .where('employee_id', template.employeeId)
        .select('access_point_employee_pin')
        .first()
      const pin = pivot?.accessPointEmployeePin ?? null
      if (pin === null || pin.length === 0) return 0
      return await this.incidents.resolveResolvedCause(
        ADMS_INCIDENT_KIND.FINGERPRINT_NOT_SPREAD,
        sourceAccessPointId,
        now,
        { pin, bioNo: template.biometricTemplateBioNo }
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
