import { test } from '@japa/runner'
import PinResolverService from '#modules/adms/ingestion/pin_resolver.service'
import type {
  EmployeeMatch,
  PinResolverRepository,
  PivotMatch,
} from '#modules/adms/ingestion/pin_resolver.repository'

interface Options {
  pivot?: PivotMatch | null
  employees?: EmployeeMatch[]
  /** El indice unico rechaza el alta inferida. */
  duplicate?: boolean
}

function makeService(options: Options = {}) {
  const created: Array<{ employeeId: number; pin: string }> = []
  const repository: PinResolverRepository = {
    async findPivot() {
      return options.pivot ?? null
    },
    async findEmployeesByCode() {
      return options.employees ?? []
    },
    async createInferredPivot(input) {
      created.push({ employeeId: input.employeeId, pin: input.pin })
      return options.duplicate ? 'duplicate' : 'created'
    },
  }
  return { service: new PinResolverService(repository), created }
}

const INPUT = { accessPointId: 12, businessUnitId: 1, pin: '9999', shared: false }

test.group('ADMS pin resolver', () => {
  test('el pivote manda: resuelve sin tocar el codigo del colaborador', async ({ assert }) => {
    const { service, created } = makeService({
      pivot: {
        accessPointEmployeeId: 5,
        employeeId: 77,
        employeeCode: 'EMP-77',
        businessUnitId: 3,
        syncStatus: 'confirmed',
      },
      employees: [{ employeeId: 99, employeeCode: '9999', terminated: false }],
    })
    const result = await service.resolve(INPUT)
    assert.deepEqual(result, {
      kind: 'employee',
      employeeId: 77,
      employeeCode: 'EMP-77',
      businessUnitId: 3,
      pinInferred: false,
    })
    assert.lengthOf(created, 0)
  })

  test('un PIN con borrado acusado pero sin confirmar queda en cuarentena', async ({ assert }) => {
    const { service } = makeService({
      pivot: {
        accessPointEmployeeId: 5,
        employeeId: 77,
        employeeCode: 'EMP-77',
        businessUnitId: 3,
        syncStatus: 'revoke_acked',
      },
    })
    const result = await service.resolve(INPUT)
    assert.deepEqual(result, { kind: 'held', reason: 'pin_quarantined' })
  })

  test('sin pivote, un unico colaborador con ese codigo crea la fila inferida', async ({
    assert,
  }) => {
    const { service, created } = makeService({
      employees: [{ employeeId: 99, employeeCode: '9999', terminated: false }],
    })
    const result = await service.resolve(INPUT)
    assert.deepEqual(result, {
      kind: 'employee',
      employeeId: 99,
      employeeCode: '9999',
      businessUnitId: 1,
      pinInferred: true,
    })
    assert.deepEqual(created, [{ employeeId: 99, pin: '9999' }])
  })

  test('si el numero ya tiene dueno en el aparato, retiene y no acredita al candidato', async ({
    assert,
  }) => {
    const { service } = makeService({
      employees: [{ employeeId: 99, employeeCode: '9999', terminated: false }],
      duplicate: true,
    })
    const result = await service.resolve(INPUT)
    assert.deepEqual(result, { kind: 'held', reason: 'unknown_pin' })
  })

  test('un colaborador dado de baja se retiene: nunca entra a assists', async ({ assert }) => {
    const { service, created } = makeService({
      employees: [{ employeeId: 99, employeeCode: '9999', terminated: true }],
    })
    const result = await service.resolve(INPUT)
    assert.deepEqual(result, { kind: 'held', reason: 'employee_terminated' })
    assert.lengthOf(created, 0)
  })

  test('dos colaboradores con el mismo codigo: ambiguo, no se adivina', async ({ assert }) => {
    const { service, created } = makeService({
      employees: [
        { employeeId: 99, employeeCode: '9999', terminated: false },
        { employeeId: 100, employeeCode: '9999', terminated: false },
      ],
    })
    const result = await service.resolve(INPUT)
    assert.deepEqual(result, { kind: 'held', reason: 'ambiguous_code' })
    assert.lengthOf(created, 0)
  })

  test('un PIN que no corresponde a nadie se retiene como desconocido', async ({ assert }) => {
    const { service } = makeService()
    const result = await service.resolve(INPUT)
    assert.deepEqual(result, { kind: 'held', reason: 'unknown_pin' })
  })

  test('en checador compartido, sin pivote no infiere por codigo: retiene', async ({ assert }) => {
    const { service, created } = makeService({
      employees: [{ employeeId: 99, employeeCode: '9999', terminated: false }],
    })
    const result = await service.resolve({ ...INPUT, shared: true })
    assert.deepEqual(result, { kind: 'held', reason: 'shared_device_no_pivot' })
    assert.lengthOf(created, 0)
  })

  test('en checador compartido, el pivote sigue resolviendo', async ({ assert }) => {
    const { service } = makeService({
      pivot: {
        accessPointEmployeeId: 5,
        employeeId: 77,
        employeeCode: 'EMP-77',
        businessUnitId: 3,
        syncStatus: 'confirmed',
      },
    })
    const result = await service.resolve({ ...INPUT, shared: true })
    assert.equal(result.kind, 'employee')
  })
})
