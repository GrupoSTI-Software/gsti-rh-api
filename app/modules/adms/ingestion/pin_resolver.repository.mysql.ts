import { DateTime } from 'luxon'
import AccessPointEmployee, {
  ACCESS_POINT_EMPLOYEE_PIN_SOURCE,
  ACCESS_POINT_EMPLOYEE_SYNC_STATUS,
} from '#models/access_point_employee'
import Employee from '#models/employee'
import type {
  EmployeeMatch,
  PinResolverRepository,
  PivotMatch,
} from './pin_resolver.repository.js'

/** Adaptador Lucid de la resolucion del PIN. */
export default class PinResolverRepositoryMysql implements PinResolverRepository {
  /**
   * De quien es ese numero en ese equipo.
   *
   * El orden no es adorno. Un numero no se recicla, asi que lo normal es que
   * solo haya un vinculo vivo con ese PIN; pero si un dato viejo dejo dos, la
   * checada es del vinculo vigente y no del revocado, y sin `ORDER BY` la base
   * puede devolver cualquiera de los dos segun como recorra el indice. El
   * desempate final por identificador evita que la atribucion dependa del plan
   * de ejecucion.
   */
  async findPivot(accessPointId: number, pin: string): Promise<PivotMatch | null> {
    const row = await AccessPointEmployee.query()
      .where('access_point_id', accessPointId)
      .where('access_point_employee_pin', pin)
      .orderByRaw('CASE WHEN access_point_employee_sync_status = ? THEN 1 ELSE 0 END', [
        ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED,
      ])
      .orderBy('access_point_employee_id', 'desc')
      .preload('employee', (query) => query.withTrashed())
      .first()
    if (!row) return null
    return {
      accessPointEmployeeId: row.accessPointEmployeeId,
      employeeId: row.employeeId,
      employeeCode: row.employee?.employeeCode ? String(row.employee.employeeCode) : '',
      syncStatus: row.accessPointEmployeeSyncStatus,
    }
  }

  /**
   * `withTrashed()` es obligatorio: la baja renombra el codigo a
   * `<code>-IN<epoch>`, asi que un ex-colaborador no aparece por codigo; pero
   * si el renombre no ocurrio, hay que verlo para retener en vez de crear un
   * pivote hacia alguien que ya no trabaja aqui.
   */
  async findEmployeesByCode(businessUnitId: number, code: string): Promise<EmployeeMatch[]> {
    const rows = await Employee.query()
      .withTrashed()
      .where('business_unit_id', businessUnitId)
      .where('employee_code', code)
    return rows.map((row) => ({
      employeeId: row.employeeId,
      employeeCode: row.employeeCode ? String(row.employeeCode) : '',
      terminated: row.deletedAt !== null,
    }))
  }

  async createInferredPivot(input: {
    accessPointId: number
    businessUnitId: number
    employeeId: number
    pin: string
  }): Promise<void> {
    const pivot = new AccessPointEmployee()
    pivot.accessPointId = input.accessPointId
    pivot.businessUnitId = input.businessUnitId
    pivot.employeeId = input.employeeId
    pivot.accessPointEmployeePin = input.pin
    pivot.accessPointEmployeePinSource = ACCESS_POINT_EMPLOYEE_PIN_SOURCE.INFERRED
    /**
     * `confirmed` y no `pending`: el colaborador YA responde en ese equipo, es
     * lo que acaba de demostrar al marcar. Pedir su alta seria pisar un
     * registro biometrico que existe y funciona.
     */
    pivot.accessPointEmployeeSyncStatus = ACCESS_POINT_EMPLOYEE_SYNC_STATUS.CONFIRMED
    pivot.accessPointEmployeeSyncConfirmedAt = DateTime.utc()
    try {
      await pivot.save()
    } catch (error) {
      /**
       * El numero ya es de otra persona en ese equipo: el indice unico lo
       * rechaza. La ingesta NO se rompe por esto -- la checada se retiene y la
       * resuelve quien pueda decidir de quien es -- pero tampoco se inventa un
       * dueno para el PIN.
       */
      if ((error as { code?: string })?.code !== 'ER_DUP_ENTRY') throw error
    }
  }
}
