import { ADMS_HELD_PUNCH_REASON, type AdmsHeldPunchReason } from '#models/adms_held_punch'
import { ACCESS_POINT_EMPLOYEE_SYNC_STATUS } from '#models/access_point_employee'
import PinResolverRepositoryMysql from './pin_resolver.repository.mysql.js'
import type { PinResolverRepository } from './pin_resolver.repository.js'

export type PinResolution =
  | { kind: 'employee'; employeeId: number; employeeCode: string; pinInferred: boolean }
  | { kind: 'held'; reason: AdmsHeldPunchReason }

export interface PinResolverInput {
  accessPointId: number
  businessUnitId: number
  pin: string
}

/**
 * PIN del checador a colaborador (spec v2, 5.2, decision D2).
 *
 * Orden: primero el pivote, que es la verdad explicita de quien esta dado de
 * alta en ese equipo; despues el codigo de colaborador dentro de la empresa,
 * que es la convencion con la que los equipos ya estaban cargados. Lo que no
 * resuelve NUNCA se rechaza: se retiene con su motivo, porque una checada
 * perdida es tiempo trabajado que nadie paga.
 */
export default class PinResolverService {
  constructor(private readonly repository: PinResolverRepository = new PinResolverRepositoryMysql()) {}

  async resolve(input: PinResolverInput): Promise<PinResolution> {
    const pivot = await this.repository.findPivot(input.accessPointId, input.pin)
    if (pivot) {
      /**
       * El borrado se acuso pero nadie confirmo que el equipo lo aplico: la
       * checada podria ser de la persona nueva que reciclo ese PIN. Se retiene
       * hasta que la matriz confirme (rebanada 7).
       */
      if (pivot.syncStatus === ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_ACKED) {
        return { kind: 'held', reason: ADMS_HELD_PUNCH_REASON.PIN_QUARANTINED }
      }
      return {
        kind: 'employee',
        employeeId: pivot.employeeId,
        employeeCode: pivot.employeeCode,
        pinInferred: false,
      }
    }

    const candidates = await this.repository.findEmployeesByCode(input.businessUnitId, input.pin)
    if (candidates.length === 0) {
      return { kind: 'held', reason: ADMS_HELD_PUNCH_REASON.UNKNOWN_PIN }
    }
    if (candidates.length > 1) {
      return { kind: 'held', reason: ADMS_HELD_PUNCH_REASON.AMBIGUOUS_CODE }
    }

    const [candidate] = candidates
    if (candidate.terminated) {
      return { kind: 'held', reason: ADMS_HELD_PUNCH_REASON.EMPLOYEE_TERMINATED }
    }

    await this.repository.createInferredPivot({
      accessPointId: input.accessPointId,
      businessUnitId: input.businessUnitId,
      employeeId: candidate.employeeId,
      pin: input.pin,
    })

    return {
      kind: 'employee',
      employeeId: candidate.employeeId,
      employeeCode: candidate.employeeCode,
      pinInferred: true,
    }
  }
}
