import { BIOMETRIC_VAULT_ERROR_CODES } from '#constants/biometric_vault_error_codes'
import { BiometricVaultError } from '#exceptions/biometric_vault_error'
import { DEVICE_COMMAND_KIND } from '#modules/device-commands/device_command.constants'
import DeviceCommandService from '#modules/device-commands/device_command.service'
import type { DeviceCommandPort } from '#modules/device-commands/device_command_port'
import EmployeeSyncRepositoryMysql from '#modules/access-point/employee-sync/employee_sync.repository.mysql'
import type { EmployeeSyncRepository } from '#modules/access-point/employee-sync/employee_sync.repository'
import type DeviceCommand from '#models/device_command'
import ConsentGate from '../consent/consent_gate.js'
import { enrollmentCorrelationKey, isValidFingerId } from './fingerprint_enrollment.constants.js'

export interface FingerprintEnrollmentInput {
  accessPointId: number
  businessUnitId: number
  employeeId: number
  fingerId: number
  requestedByUserId: number | null
}

export interface FingerprintEnrollmentResult {
  command: DeviceCommand
  created: boolean
}

/**
 * Pide al equipo que capture una huella con el dedo puesto (spec ADMS 6.4).
 *
 * El orden de las puertas importa: primero el consentimiento, que es la unica
 * que protege a la persona; despues el PIN, que es lo que hace tecnicamente
 * posible el comando. Al reves se filtraria si alguien esta o no dado de alta
 * en un equipo antes de comprobar si se le puede tocar el dato biometrico.
 *
 * El comando NO trae biometrico: lo que viaja es una orden de capturar. El
 * template llega despues, por su cuenta, en una subida del aparato.
 */
export default class FingerprintEnrollmentService {
  constructor(
    private readonly commands: DeviceCommandPort = new DeviceCommandService(),
    private readonly pivots: EmployeeSyncRepository = new EmployeeSyncRepositoryMysql(),
    private readonly consent: ConsentGate = new ConsentGate()
  ) {}

  async request(input: FingerprintEnrollmentInput): Promise<FingerprintEnrollmentResult> {
    if (!isValidFingerId(input.fingerId)) {
      throw new BiometricVaultError(
        'El dedo indicado no existe en el equipo',
        BIOMETRIC_VAULT_ERROR_CODES.VAL_MISSING_FIELD,
        422,
        'dedo-invalido',
        'El equipo numera los dedos del 0 al 9.'
      )
    }

    await this.consent.assertGranted(input.employeeId)

    const pivot = await this.pivots.findPivot(input.accessPointId, input.employeeId)
    const pin = pivot?.accessPointEmployeePin ?? null
    if (!pivot || pin === null || pin.length === 0) {
      throw new BiometricVaultError(
        'El colaborador no tiene numero en ese equipo',
        BIOMETRIC_VAULT_ERROR_CODES.PIN_MISSING,
        422,
        'sin-pin-en-el-equipo',
        'Da de alta al colaborador en el equipo y asignale un numero antes de enrolar su huella.'
      )
    }

    const result = await this.commands.enqueue({
      accessPointId: input.accessPointId,
      businessUnitId: input.businessUnitId,
      kind: DEVICE_COMMAND_KIND.ENROLL_FP,
      fields: { pin, fid: input.fingerId },
      employeeId: input.employeeId,
      accessPointEmployeeId: pivot.accessPointEmployeeId,
      correlationKey: enrollmentCorrelationKey(pin, input.fingerId),
      requestedByUserId: input.requestedByUserId,
    })

    return { command: result.command, created: result.created }
  }
}
