import { test } from '@japa/runner'
import EmployeeSyncService from '#modules/access-point/employee-sync/employee_sync.service'
import type {
  EmployeeSyncRepository,
  SyncEventInput,
} from '#modules/access-point/employee-sync/employee_sync.repository'
import type AccessPointEmployee from '#models/access_point_employee'
import type { AccessPointEmployeeSyncStatus } from '#models/access_point_employee'
import type { DeviceCommandPort, EnqueueCommandInput } from '#modules/device-commands/device_command_port'
import type DeviceCommand from '#models/device_command'
import { AdmsError } from '#exceptions/adms_error'

function pivotOf(overrides: Partial<AccessPointEmployee> = {}): AccessPointEmployee {
  return {
    accessPointEmployeeId: 5,
    accessPointId: 12,
    businessUnitId: 1,
    employeeId: 77,
    accessPointEmployeePin: '9999',
    accessPointEmployeeSyncStatus: 'confirmed' as AccessPointEmployeeSyncStatus,
    accessPointEmployeePinSource: 'assigned',
    deletedAt: null,
    async save() {},
    ...overrides,
  } as unknown as AccessPointEmployee
}

interface Options {
  pivot?: AccessPointEmployee | null
  withTrashed?: AccessPointEmployee | null
  pinHolders?: AccessPointEmployee[]
  live?: AccessPointEmployee[]
  enqueueThrows?: boolean
}

function makeService(options: Options = {}) {
  const saved: AccessPointEmployee[] = []
  const events: SyncEventInput[] = []
  const enqueued: EnqueueCommandInput[] = []
  const statuses: Array<{ id: number; status: string }> = []

  const repository: EmployeeSyncRepository = {
    async withDeviceLock(_id, fn) {
      return fn()
    },
    async findPivot() {
      return options.pivot ?? null
    },
    async findPivotWithTrashed() {
      return options.withTrashed ?? options.pivot ?? null
    },
    async findByPin() {
      return options.pinHolders ?? []
    },
    async listLiveByEmployee() {
      return options.live ?? []
    },
    async save(pivot) {
      saved.push(pivot)
    },
    async recordEvent(input) {
      events.push(input)
    },
    async findByCommandTarget() {
      return options.pivot ?? null
    },
    async updateStatus(id, status) {
      statuses.push({ id, status })
      return options.pivot ?? null
    },
  }

  const commands: DeviceCommandPort = {
    async enqueue(input) {
      if (options.enqueueThrows) throw new Error('la cola no respondio')
      enqueued.push(input)
      return {
        command: { deviceCommandId: enqueued.length } as DeviceCommand,
        created: true,
      }
    },
    async cancel() {
      return {} as DeviceCommand
    },
    async retry() {
      return {} as DeviceCommand
    },
    async listByDevice() {
      return []
    },
    async listByEmployee() {
      return []
    },
  }

  return { service: new EmployeeSyncService(repository, commands), saved, events, enqueued }
}

const ACTOR = { userId: 44 }

test.group('PIN del colaborador en el equipo', () => {
  test('un PIN fuera de patron se rechaza', async ({ assert }) => {
    const { service } = makeService({ pivot: pivotOf() })
    let capturado: unknown = null
    try {
      await service.setPin({
        accessPointId: 12,
        businessUnitId: 1,
        employeeId: 77,
        pin: 'ABC',
        actor: ACTOR,
      })
    } catch (error) {
      capturado = error
    }
    assert.instanceOf(capturado, AdmsError)
    assert.equal((capturado as AdmsError).key, 'pin-invalido')
  })

  test('un PIN ocupado por otro colaborador se rechaza', async ({ assert }) => {
    const { service } = makeService({
      pivot: pivotOf({ accessPointEmployeePin: '1' }),
      pinHolders: [pivotOf({ accessPointEmployeeId: 99 })],
    })
    let capturado: unknown = null
    try {
      await service.setPin({
        accessPointId: 12,
        businessUnitId: 1,
        employeeId: 77,
        pin: '9999',
        actor: ACTOR,
      })
    } catch (error) {
      capturado = error
    }
    assert.equal((capturado as AdmsError).key, 'pin-ocupado')
  })

  test('un PIN en cuarentena tampoco se reasigna: el borrado no esta confirmado', async ({
    assert,
  }) => {
    const { service } = makeService({
      pivot: pivotOf({ accessPointEmployeeId: 5, accessPointEmployeePin: '1' }),
      // El repositorio ya devuelve las filas en cuarentena; aqui se comprueba
      // que el servicio no las ignora por venir borradas logicamente.
      pinHolders: [
        pivotOf({
          accessPointEmployeeId: 99,
          accessPointEmployeeSyncStatus: 'revoke_acked',
          deletedAt: null,
        }),
      ],
    })
    let capturado: unknown = null
    try {
      await service.setPin({
        accessPointId: 12,
        businessUnitId: 1,
        employeeId: 77,
        pin: '9999',
        actor: ACTOR,
      })
    } catch (error) {
      capturado = error
    }
    assert.equal((capturado as AdmsError).key, 'pin-ocupado')
  })

  test('el propio PIN no choca consigo mismo', async ({ assert }) => {
    const { service, events } = makeService({
      pivot: pivotOf({ accessPointEmployeePin: '9999' }),
      pinHolders: [pivotOf({ accessPointEmployeeId: 5 })],
    })
    const pivot = await service.setPin({
      accessPointId: 12,
      businessUnitId: 1,
      employeeId: 77,
      pin: '9999',
      actor: ACTOR,
    })
    assert.equal(pivot.accessPointEmployeePin, '9999')
    assert.equal(events[0].kind, 'pin_assigned')
  })

  test('cambiar el PIN borra primero el registro anterior del equipo', async ({ assert }) => {
    const { service, enqueued, events } = makeService({
      pivot: pivotOf({ accessPointEmployeePin: '1111' }),
    })
    await service.setPin({
      accessPointId: 12,
      businessUnitId: 1,
      employeeId: 77,
      pin: '2222',
      actor: ACTOR,
    })

    assert.lengthOf(enqueued, 1)
    assert.equal(enqueued[0].kind, 'user_delete')
    assert.equal(enqueued[0].fields.pin, '1111')
    assert.equal(events[0].kind, 'pin_change')
    assert.equal(events[0].fromPin, '1111')
    assert.equal(events[0].toPin, '2222')
  })

  test('fijar el PIN de una fila sin PIN la deja lista para enviar', async ({ assert }) => {
    const { service, enqueued } = makeService({
      pivot: pivotOf({ accessPointEmployeePin: '', accessPointEmployeeSyncStatus: 'pending_pin' }),
    })
    const pivot = await service.setPin({
      accessPointId: 12,
      businessUnitId: 1,
      employeeId: 77,
      pin: '2222',
      actor: ACTOR,
    })
    assert.equal(pivot.accessPointEmployeeSyncStatus, 'pending')
    // No habia PIN anterior: no hay nada que borrar en el equipo.
    assert.lengthOf(enqueued, 0)
  })
})

test.group('Envio y revocacion', () => {
  test('enviar sin PIN se rechaza', async ({ assert }) => {
    const { service } = makeService({
      pivot: pivotOf({ accessPointEmployeePin: '', accessPointEmployeeSyncStatus: 'pending_pin' }),
    })
    let capturado: unknown = null
    try {
      await service.send({
        accessPointId: 12,
        businessUnitId: 1,
        employeeId: 77,
        employeeName: 'Juan Perez',
        actor: ACTOR,
      })
    } catch (error) {
      capturado = error
    }
    assert.equal((capturado as AdmsError).key, 'pin-faltante')
  })

  test('enviar encola el alta con el nombre y deja evento', async ({ assert }) => {
    const { service, enqueued, events } = makeService({
      pivot: pivotOf({ accessPointEmployeeSyncStatus: 'pending' }),
    })
    await service.send({
      accessPointId: 12,
      businessUnitId: 1,
      employeeId: 77,
      employeeName: 'Juan Perez',
      actor: ACTOR,
    })
    assert.equal(enqueued[0].kind, 'user_upsert')
    assert.equal(enqueued[0].fields.pin, '9999')
    assert.equal(enqueued[0].fields.name, 'Juan Perez')
    assert.equal(enqueued[0].accessPointEmployeeId, 5)
    assert.equal(events[0].kind, 'send_requested')
  })

  test('revocar pasa a revocando y encola el borrado', async ({ assert }) => {
    const { service, enqueued, events } = makeService({ pivot: pivotOf() })
    const pivot = await service.revoke({
      accessPointId: 12,
      businessUnitId: 1,
      employeeId: 77,
      actor: ACTOR,
    })
    assert.equal(pivot.accessPointEmployeeSyncStatus, 'revoking')
    assert.equal(enqueued[0].kind, 'user_delete')
    assert.equal(enqueued[0].fields.pin, '9999')
    assert.equal(events[0].kind, 'revoke_requested')
    assert.equal(events[0].fromStatus, 'confirmed')
  })

  test('revocar dos veces no rompe: ya estaba en el camino de baja', async ({ assert }) => {
    const { service } = makeService({
      pivot: pivotOf({ accessPointEmployeeSyncStatus: 'revoking' }),
    })
    const pivot = await service.revoke({
      accessPointId: 12,
      businessUnitId: 1,
      employeeId: 77,
      actor: ACTOR,
    })
    assert.equal(pivot.accessPointEmployeeSyncStatus, 'revoking')
  })
})

test.group('Baja del colaborador', () => {
  test('revoca en todos los equipos donde estaba', async ({ assert }) => {
    const { service, enqueued } = makeService({
      pivot: pivotOf(),
      live: [pivotOf({ accessPointId: 12 }), pivotOf({ accessPointId: 13 })],
    })
    const results = await service.revokeAll(77, 44)
    assert.lengthOf(results, 2)
    assert.isTrue(results.every((row) => row.ok))
    assert.lengthOf(enqueued, 2)
  })

  test('un equipo que falla no impide revocar en los demas', async ({ assert }) => {
    const { service } = makeService({
      pivot: pivotOf(),
      live: [pivotOf({ accessPointId: 12 })],
      enqueueThrows: true,
    })
    const results = await service.revokeAll(77, 44)
    // No lanza: la baja del colaborador no puede detenerse por un checador.
    assert.lengthOf(results, 1)
    assert.isFalse(results[0].ok)
    assert.include(results[0].error ?? '', 'la cola no respondio')
  })

  test('sin equipos asignados no hay nada que revocar', async ({ assert }) => {
    const { service } = makeService({ live: [] })
    assert.deepEqual(await service.revokeAll(77, 44), [])
  })
})

test.group('Reasignacion', () => {
  test('una fila revocada revive en vez de crear otra', async ({ assert }) => {
    const revocada = pivotOf({
      accessPointEmployeeSyncStatus: 'revoked',
      deletedAt: { toISO: () => '2026-01-01' } as never,
    })
    const { service, events } = makeService({ withTrashed: revocada })
    const pivot = await service.assign({
      accessPointId: 12,
      businessUnitId: 1,
      employeeId: 77,
      employeeCode: '9999',
      actor: ACTOR,
    })
    assert.isNull(pivot.deletedAt)
    assert.equal(events[0].kind, 'reassigned')
  })

  test('el codigo del colaborador se propone como PIN si sirve', async ({ assert }) => {
    const { service, events } = makeService({ withTrashed: null, pivot: null })
    await service.assign({
      accessPointId: 12,
      businessUnitId: 1,
      employeeId: 77,
      employeeCode: '4321',
      actor: ACTOR,
    })
    const asignado = events.find((event) => event.kind === 'pin_assigned')
    assert.isDefined(asignado)
    assert.equal(asignado?.toPin, '4321')
    assert.equal(asignado?.detail, 'PIN tomado del codigo del colaborador')
  })

  test('un codigo que no sirve como PIN deja la fila esperando uno', async ({ assert }) => {
    const { service, events } = makeService({ withTrashed: null, pivot: null })
    await service.assign({
      accessPointId: 12,
      businessUnitId: 1,
      employeeId: 77,
      employeeCode: 'EMP-77',
      actor: ACTOR,
    })
    assert.lengthOf(
      events.filter((event) => event.kind === 'pin_assigned'),
      0
    )
  })
})
