import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import AccessPoint from '#models/access_point'
import AccessPointEmployee, {
  ACCESS_POINT_EMPLOYEE_SYNC_STATUS,
} from '#models/access_point_employee'
import BusinessUnitUser from '#models/business_unit_user'
import EmployeeSyncRepositoryMysql from '#modules/access-point/employee-sync/employee_sync.repository.mysql'
import Employee from '#models/employee'
import { TenantContext } from '#utils/tenant_context'

/**
 * Un PIN, una persona (spec ADMS 8.1).
 *
 * La unicidad del numero dentro de un equipo vive en la base y no solo en el
 * cerrojo de la aplicacion: el canal crea pivotes por su cuenta cuando ve un
 * PIN suelto, y ese camino no pasa por el cerrojo.
 */
const STAMP = `${Date.now()}`
const PIN = `6${STAMP.slice(-4)}`

test.group('Unicidad del PIN por equipo', (group) => {
  let accessPoint: AccessPoint
  let businessUnitId: number
  let primero: number
  let segundo: number

  group.setup(async () => {
    await TenantContext.runUnscoped(async () => {
      const pivots = await BusinessUnitUser.query().orderBy('businessUnitId', 'asc')
      let elegidos: { unitId: number; a: number; b: number } | null = null
      for (const candidate of pivots) {
        const personas = await Employee.query()
          .whereNull('employee_deleted_at')
          .where('business_unit_id', candidate.businessUnitId)
          .limit(2)
        if (personas.length === 2) {
          elegidos = {
            unitId: candidate.businessUnitId,
            a: personas[0].employeeId,
            b: personas[1].employeeId,
          }
          break
        }
      }
      if (!elegidos) throw new Error('Se requiere una empresa con dos colaboradores.')
      businessUnitId = elegidos.unitId
      primero = elegidos.a
      segundo = elegidos.b

      const ap = new AccessPoint()
      ap.accessPointName = `Checador de unicidad ${STAMP}`
      ap.businessUnitId = businessUnitId
      ap.accessPointActive = 1
      ap.accessPointSerialNumber = `TEST-PIN-UQ-${STAMP}`
      ap.accessPointStatus = 0
      await ap.save()
      accessPoint = ap
    }, 'fixture de unicidad de PIN')
  })

  group.teardown(async () => {
    await TenantContext.runUnscoped(async () => {
      await db
        .from('access_point_employees')
        .where('access_point_id', accessPoint.accessPointId)
        .delete()
      await db.from('access_points').where('access_point_id', accessPoint.accessPointId).delete()
    }, 'limpieza de unicidad de PIN')
  })

  /** Crea el pivote saltandose el cerrojo, como hace el canal. */
  const crear = async (
    employeeId: number,
    status = ACCESS_POINT_EMPLOYEE_SYNC_STATUS.CONFIRMED,
    pin = PIN
  ): Promise<AccessPointEmployee> =>
    TenantContext.run([businessUnitId], async () => {
      const pivot = new AccessPointEmployee()
      pivot.accessPointId = accessPoint.accessPointId
      pivot.businessUnitId = businessUnitId
      pivot.employeeId = employeeId
      pivot.accessPointEmployeePin = pin
      pivot.accessPointEmployeeSyncStatus = status
      pivot.accessPointEmployeePinSource = 'assigned'
      await pivot.save()
      return pivot
    })

  test('dos personas no pueden compartir numero en el mismo equipo', async ({ assert }) => {
    await crear(primero)

    let fallo: unknown = null
    try {
      await crear(segundo)
    } catch (error) {
      fallo = error
    }

    assert.isNotNull(fallo)
    assert.include(String((fallo as { code?: string })?.code ?? fallo), 'ER_DUP_ENTRY')
  })

  /** Deja al primer colaborador en el estado que pide la prueba. */
  const ponerEstado = async (status: (typeof ACCESS_POINT_EMPLOYEE_SYNC_STATUS)[keyof typeof ACCESS_POINT_EMPLOYEE_SYNC_STATUS]): Promise<void> => {
    await TenantContext.run([businessUnitId], async () => {
      const vivo = await AccessPointEmployee.query()
        .where('access_point_id', accessPoint.accessPointId)
        .where('employee_id', primero)
        .firstOrFail()
      vivo.accessPointEmployeeSyncStatus = status
      await vivo.save()
    })
  }

  test('una baja confirmada tampoco devuelve el numero al monton', async ({ assert }) => {
    await ponerEstado(ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED)

    /**
     * El equipo sube checadas guardadas sin red dias despues: si el numero
     * cambiara de dueno, esos marcajes se acreditarian a quien no los hizo.
     */
    let fallo: unknown = null
    try {
      await crear(segundo)
    } catch (error) {
      fallo = error
    }

    assert.isNotNull(fallo)
    assert.include(String((fallo as { code?: string })?.code ?? fallo), 'ER_DUP_ENTRY')
  })

  test('una baja sin confirmar tampoco libera el numero', async ({ assert }) => {
    await ponerEstado(ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_ACKED)

    let fallo: unknown = null
    try {
      await crear(segundo)
    } catch (error) {
      fallo = error
    }

    assert.isNotNull(fallo)
    assert.include(String((fallo as { code?: string })?.code ?? fallo), 'ER_DUP_ENTRY')
  })

  test('la lista de numeros ocupados cuenta la baja confirmada', async ({ assert }) => {
    await ponerEstado(ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED)

    const repository = new EmployeeSyncRepositoryMysql()
    const ocupados = await TenantContext.run([businessUnitId], async () =>
      repository.listTakenPins(accessPoint.accessPointId)
    )

    assert.include(ocupados, PIN)
  })

  test('el propio vinculo no figura como ocupante de su numero', async ({ assert }) => {
    await ponerEstado(ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKED)

    const repository = new EmployeeSyncRepositoryMysql()
    const { ocupados, propio } = await TenantContext.run([businessUnitId], async () => {
      const fila = await AccessPointEmployee.query()
        .where('access_point_id', accessPoint.accessPointId)
        .where('employee_id', primero)
        .firstOrFail()
      return {
        propio: fila.accessPointEmployeeId,
        ocupados: await repository.listTakenPins(
          accessPoint.accessPointId,
          fila.accessPointEmployeeId
        ),
      }
    })

    // Sin esta exclusion nadie recuperaria su numero al volver al equipo.
    assert.isNumber(propio)
    assert.notInclude(ocupados, PIN)
  })

  test('retirar la asignacion con la baja en camino no libera el numero', async ({ assert }) => {
    await TenantContext.run([businessUnitId], async () => {
      const vivo = await AccessPointEmployee.query()
        .where('access_point_id', accessPoint.accessPointId)
        .where('employee_id', primero)
        .firstOrFail()
      vivo.accessPointEmployeeSyncStatus = ACCESS_POINT_EMPLOYEE_SYNC_STATUS.REVOKE_SENT
      await vivo.save()
      // Borrado logico: el indice deja de verla, la cuarentena no.
      await vivo.delete()
    })

    const repository = new EmployeeSyncRepositoryMysql()
    const ocupados = await TenantContext.run([businessUnitId], async () =>
      repository.listTakenPins(accessPoint.accessPointId)
    )

    assert.include(ocupados, PIN)
  })
})

test.group('El PIN es del equipo, no del sistema', (group) => {
  let equipoA: AccessPoint
  let equipoB: AccessPoint
  let businessUnitId: number
  let employeeId: number

  group.setup(async () => {
    await TenantContext.runUnscoped(async () => {
      const pivots = await BusinessUnitUser.query().orderBy('businessUnitId', 'asc')
      let elegido: { unitId: number; employeeId: number } | null = null
      for (const candidate of pivots) {
        const persona = await Employee.query()
          .whereNull('employee_deleted_at')
          .where('business_unit_id', candidate.businessUnitId)
          .first()
        if (persona) {
          elegido = { unitId: candidate.businessUnitId, employeeId: persona.employeeId }
          break
        }
      }
      if (!elegido) throw new Error('Se requiere una empresa con colaborador.')
      businessUnitId = elegido.unitId
      employeeId = elegido.employeeId

      const crearEquipo = async (sufijo: string): Promise<AccessPoint> => {
        const ap = new AccessPoint()
        ap.accessPointName = `Checador ${sufijo} ${STAMP}`
        ap.businessUnitId = businessUnitId
        ap.accessPointActive = 1
        ap.accessPointSerialNumber = `TEST-PIN-${sufijo}-${STAMP}`
        ap.accessPointStatus = 0
        await ap.save()
        return ap
      }
      equipoA = await crearEquipo('A')
      equipoB = await crearEquipo('B')
    }, 'fixture de PIN por equipo')
  })

  group.teardown(async () => {
    await TenantContext.runUnscoped(async () => {
      const ids = [equipoA.accessPointId, equipoB.accessPointId]
      await db.from('access_point_employees').whereIn('access_point_id', ids).delete()
      await db.from('access_points').whereIn('access_point_id', ids).delete()
    }, 'limpieza de PIN por equipo')
  })

  test('el mismo numero puede existir en dos equipos distintos', async ({ assert }) => {
    const crear = async (accessPointId: number): Promise<AccessPointEmployee> =>
      TenantContext.run([businessUnitId], async () => {
        const pivot = new AccessPointEmployee()
        pivot.accessPointId = accessPointId
        pivot.businessUnitId = businessUnitId
        pivot.employeeId = employeeId
        pivot.accessPointEmployeePin = '1'
        pivot.accessPointEmployeeSyncStatus = ACCESS_POINT_EMPLOYEE_SYNC_STATUS.CONFIRMED
        pivot.accessPointEmployeePinSource = 'assigned'
        await pivot.save()
        return pivot
      })

    const enA = await crear(equipoA.accessPointId)
    const enB = await crear(equipoB.accessPointId)

    // El numero identifica a la persona DENTRO de un aparato, no en el sistema.
    assert.equal(enA.accessPointEmployeePin, '1')
    assert.equal(enB.accessPointEmployeePin, '1')
    assert.notEqual(enA.accessPointEmployeeId, enB.accessPointEmployeeId)
  })
})
