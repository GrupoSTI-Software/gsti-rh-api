import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import TemplateService, { majorOf } from '#modules/biometric-vault/template/template.service'
import type {
  TemplateKey,
  TemplateRepository,
  TemplateSlot,
  TemplateUpsert,
} from '#modules/biometric-vault/template/template.repository'
import type BiometricTemplate from '#models/biometric_template'
import type PiiAccessLogService from '#services/pii_access_log_service'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { BiometricVaultError } from '#exceptions/biometric_vault_error'

const NOW = DateTime.fromISO('2026-08-13T17:05:30Z')
const BLOB = 'A'.repeat(1120)
const TRX = {} as TransactionClientContract

function slotOf(overrides: Partial<TemplateSlot> = {}): TemplateSlot {
  return { templateId: 1, bioType: 1, bioNo: 7, majorVer: '13', capturedAt: NOW, ...overrides }
}

interface Options {
  existing?: BiometricTemplate | null
  slots?: TemplateSlot[]
  forRead?: BiometricTemplate | null
}

function makeService(options: Options = {}) {
  const upserts: TemplateUpsert[] = []
  const keysAsked: TemplateKey[] = []
  const logged: Array<{ recordId: number; accessorUserId: number | null }> = []

  const repository: TemplateRepository = {
    async findByKey(key) {
      keysAsked.push(key)
      return options.existing ?? null
    },
    async upsert(input) {
      upserts.push(input)
      return { biometricTemplateId: 42 } as BiometricTemplate
    },
    async listSlots() {
      return options.slots ?? []
    },
    async findDetail() {
      return null
    },
    async findForEmployee() {
      return options.slots ?? []
    },
    async findByIdForRead() {
      return options.forRead ?? null
    },
  }

  const piiAccessLog = {
    async record(input: { recordId: number; accessorUserId: number | null }) {
      logged.push({ recordId: input.recordId, accessorUserId: input.accessorUserId })
      return {} as never
    },
  } as unknown as PiiAccessLogService

  return { service: new TemplateService(repository, piiAccessLog), upserts, keysAsked, logged }
}

const STORE_INPUT = {
  employeeId: 77,
  businessUnitId: 1,
  bioType: 1,
  bioNo: 7,
  bioIndex: 0,
  bioFormat: 0,
  majorVer: '13',
  minorVer: '0',
  valid: 1,
  duress: 0,
  template: BLOB,
  sourceAccessPointId: 12,
  capturedAt: NOW,
}

test.group('Version de algoritmo', () => {
  test('la parte entera es lo que decide la compatibilidad', ({ assert }) => {
    assert.equal(majorOf('13'), 13)
    assert.equal(majorOf('13.2'), 13)
    assert.equal(majorOf(' 10 '), 10)
    assert.isNull(majorOf('desconocida'))
    assert.isNull(majorOf(''))
  })
})

test.group('Boveda: guardar', () => {
  test('un blob valido se guarda con su tamano medido', async ({ assert }) => {
    const { service, upserts } = makeService()
    const result = await service.store(STORE_INPUT)

    assert.isTrue(result.ok)
    if (!result.ok) return
    assert.isTrue(result.created)
    assert.equal(upserts[0].size, 1120)
    assert.equal(upserts[0].template, BLOB)
  })

  test('un blob invalido no llega al repositorio', async ({ assert }) => {
    const { service, upserts } = makeService()
    const result = await service.store({ ...STORE_INPUT, template: 'corto' })

    assert.isFalse(result.ok)
    if (result.ok) return
    assert.equal(result.reason, 'too_short')
    assert.lengthOf(upserts, 0)
  })

  test('reenviar el mismo blob actualiza en vez de duplicar', async ({ assert }) => {
    const { service } = makeService({ existing: { biometricTemplateId: 42 } as BiometricTemplate })
    const result = await service.store(STORE_INPUT)
    assert.isTrue(result.ok)
    if (!result.ok) return
    assert.isFalse(result.created)
  })

  test('la version nula viaja como nula a la llave, no como cadena', async ({ assert }) => {
    const { service, keysAsked } = makeService()
    await service.store({ ...STORE_INPUT, majorVer: null })
    assert.isNull(keysAsked[0].majorVer)
  })
})

test.group('Boveda: leer', () => {
  test('sin usuario en sesion no se lee un biometrico', async ({ assert }) => {
    const { service, logged } = makeService({
      forRead: { biometricTemplateId: 42, biometricTemplateTemplate: BLOB } as BiometricTemplate,
    })
    let capturado: unknown = null
    try {
      await service.readForReplication(
        42,
        { userId: null, businessUnitId: 1, ip: '10.0.0.1' },
        TRX
      )
    } catch (error) {
      capturado = error
    }
    assert.instanceOf(capturado, BiometricVaultError)
    assert.equal((capturado as BiometricVaultError).code, 'BVLT.AUTHZ.001')
    // Y no se asienta un acceso que no ocurrio.
    assert.lengthOf(logged, 0)
  })

  test('con sesion devuelve el blob y deja el acceso asentado', async ({ assert }) => {
    const { service, logged } = makeService({
      forRead: { biometricTemplateId: 42, biometricTemplateTemplate: BLOB } as BiometricTemplate,
    })
    const blob = await service.readForReplication(
      42,
      { userId: 9, businessUnitId: 1, ip: '10.0.0.1', requestId: 'req-1' },
      TRX
    )
    assert.equal(blob, BLOB)
    assert.deepEqual(logged, [{ recordId: 42, accessorUserId: 9 }])
  })

  test('un template que no existe no se inventa', async ({ assert }) => {
    const { service } = makeService({ forRead: null })
    let capturado: unknown = null
    try {
      await service.readForReplication(42, { userId: 9, businessUnitId: 1, ip: '10.0.0.1' }, TRX)
    } catch (error) {
      capturado = error
    }
    assert.instanceOf(capturado, BiometricVaultError)
  })
})

test.group('Boveda: compatibilidad', () => {
  test('coincide por parte entera de la version', async ({ assert }) => {
    const { service } = makeService({ slots: [slotOf({ majorVer: '13.4' })] })
    const found = await service.findCompatible(77, 1, 7, '13')
    assert.isNotNull(found)
    assert.equal(found?.templateId, 1)
  })

  test('una version distinta no es compatible', async ({ assert }) => {
    const { service } = makeService({ slots: [slotOf({ majorVer: '10' })] })
    // La bateria midio Return=-30 empujando un v10 a un equipo v13.
    assert.isNull(await service.findCompatible(77, 1, 7, '13'))
  })

  test('una version desconocida nunca es compatible', async ({ assert }) => {
    const { service } = makeService({ slots: [slotOf({ majorVer: null })] })
    assert.isNull(await service.findCompatible(77, 1, 7, '13'))
  })

  test('sin version en el destino tampoco se arriesga', async ({ assert }) => {
    const { service } = makeService({ slots: [slotOf({ majorVer: '13' })] })
    assert.isNull(await service.findCompatible(77, 1, 7, null))
  })

  test('los slots ocupados se listan para confirmar una sobrescritura', async ({ assert }) => {
    const { service } = makeService({
      slots: [slotOf(), slotOf({ templateId: 2, bioNo: 8 })],
    })
    const slots = await service.occupiedSlots(77)
    assert.lengthOf(slots, 2)
    assert.deepEqual(
      slots.map((slot) => slot.bioNo),
      [7, 8]
    )
  })
})
