import db from '@adonisjs/lucid/services/db'
import AccessPointEmployee from '#models/access_point_employee'
import BiometricTemplate from '#models/biometric_template'
import DeviceCommand from '#models/device_command'
import PiiAccessLogService from '#services/pii_access_log_service'
import { BiometricVaultError } from '#exceptions/biometric_vault_error'
import { BIOMETRIC_VAULT_ERROR_CODES } from '#constants/biometric_vault_error_codes'
import { ACCESS_POINT_EMPLOYEE_SYNC_STATUS } from '#models/access_point_employee'
import {
  DEVICE_COMMAND_KIND,
  DEVICE_COMMAND_STATUS,
} from '#modules/device-commands/device_command.constants'
import { BIO_TYPE } from '../biometric_vault.constants.js'
/**
 * Quien borra.
 *
 * El usuario NO es opcional, a diferencia de quien lee: una supresion sin
 * constancia de quien la pidio deja al responsable sin como demostrar que se
 * hizo, y esa constancia es justo lo que hay que poder probar.
 */
export interface FingerprintDeletionActor {
  userId: number
  businessUnitId: number
  ip: string
  userAgent?: string | null
  requestId?: string | null
}

export interface DeleteFingerprintInput {
  employeeId: number
  /** Dedo en la numeracion del equipo: 0 a 9. */
  fingerId: number
  actor: FingerprintDeletionActor
}

export interface DeleteFingerprintResult {
  /** Cuantas versiones del mismo dedo se borraron. */
  deleted: number
}

/**
 * Borrado de una huella del expediente.
 *
 * NO saca la huella del aparato, y no es un olvido: el protocolo no tiene verbo
 * para retirar un dedo suelto --solo `DATA DELETE USERINFO`, que arrastra a la
 * persona entera con todos sus biometricos-- y la bateria en hardware nunca
 * midio uno. Por eso este servicio se niega a borrar lo que sigue dentro de un
 * checador donde el colaborador esta dado de alta: dejaria la base diciendo que
 * no tiene huella mientras el aparato la sigue aceptando, que es peor que no
 * borrar.
 *
 * Para suprimir una huella que si esta en un equipo, el camino es retirar al
 * colaborador de ese checador --la baja arrastra sus templates-- y despues
 * borrarla de aqui.
 */
export default class FingerprintDeletionService {
  private readonly piiAccessLog: PiiAccessLogService

  constructor(piiAccessLog?: PiiAccessLogService) {
    this.piiAccessLog = piiAccessLog ?? new PiiAccessLogService()
  }

  async delete(input: DeleteFingerprintInput): Promise<DeleteFingerprintResult> {
    const templates = await BiometricTemplate.query()
      .where('employee_id', input.employeeId)
      .where('biometric_template_bio_type', BIO_TYPE.FINGERPRINT)
      .where('biometric_template_bio_no', input.fingerId)

    if (templates.length === 0) {
      throw new BiometricVaultError(
        'No hay ninguna huella de ese dedo en el expediente',
        BIOMETRIC_VAULT_ERROR_CODES.AUTHZ_OUT_OF_SCOPE,
        404,
        'biometrico-no-encontrado',
        'Ese dedo no tiene ninguna huella guardada.'
      )
    }

    const holder = await this.deviceHolding(templates, input.employeeId)
    if (holder !== null) {
      throw new BiometricVaultError(
        'La huella sigue dentro de un checador donde el colaborador esta dado de alta',
        BIOMETRIC_VAULT_ERROR_CODES.AUTHZ_OUT_OF_SCOPE,
        409,
        'huella-en-uso',
        'La huella sigue dentro de un checador donde el colaborador puede marcar. Retiralo de ese equipo y despues borrala del expediente.'
      )
    }

    /**
     * El borrado y su rastro van juntos.
     *
     * Un biometrico que desaparece sin constancia de quien lo quito deja al
     * responsable sin como demostrar que la supresion se hizo, que es justo lo
     * que la constancia tiene que probar.
     */
    return db.transaction(async (trx) => {
      for (const template of templates) {
        await this.piiAccessLog.record(
          {
            // La empresa sale de la fila; el actor la respalda porque la columna
            // admite nulo y una constancia sin empresa no se puede rastrear.
            businessUnitId: template.businessUnitId ?? input.actor.businessUnitId,
            accessorUserId: input.actor.userId,
            model: 'BiometricTemplate',
            modelColumn: 'biometricTemplateTemplate',
            recordId: template.biometricTemplateId,
            accessorIp: input.actor.ip,
            accessorUserAgent: input.actor.userAgent ?? null,
            requestId: input.actor.requestId ?? null,
          },
          trx
        )
        template.useTransaction(trx)
        await template.delete()
      }
      return { deleted: templates.length }
    })
  }

  /**
   * Primer checador vivo que todavia tiene ese dato dentro.
   *
   * Cuenta el equipo donde se capturo y aquel al que se copio con exito. Un
   * vinculo revocado no cuenta: el aparato ya recibio la baja del colaborador y
   * con ella se fueron sus huellas.
   */
  private async deviceHolding(
    templates: BiometricTemplate[],
    employeeId: number
  ): Promise<number | null> {
    const pivots = await AccessPointEmployee.query()
      .where('employee_id', employeeId)
      .whereNot('access_point_employee_sync_status', ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED)
    const assigned = new Set(pivots.map((pivot) => pivot.accessPointId))
    if (assigned.size === 0) return null

    for (const template of templates) {
      if (template.sourceAccessPointId !== null && assigned.has(template.sourceAccessPointId)) {
        return template.sourceAccessPointId
      }
    }

    const replicas = await DeviceCommand.query()
      .whereIn('access_point_id', [...assigned])
      .where('device_command_kind', DEVICE_COMMAND_KIND.BIODATA_WRITE)
      .where('device_command_status', DEVICE_COMMAND_STATUS.EXECUTED)
      .whereIn(
        'biometric_template_id',
        templates.map((template) => template.biometricTemplateId)
      )

    return replicas.length > 0 ? replicas[0].accessPointId : null
  }
}
