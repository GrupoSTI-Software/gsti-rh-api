import { test } from '@japa/runner'
import FingerprintEnrollmentService from '#modules/biometric-vault/enrollment/fingerprint_enrollment.service'
import { BiometricVaultError } from '#exceptions/biometric_vault_error'
import type { EnqueueCommandInput } from '#modules/device-commands/device_command_port'
import type { DeviceCommandPort } from '#modules/device-commands/device_command_port'
import type { EmployeeSyncRepository } from '#modules/access-point/employee-sync/employee_sync.repository'
import type AccessPointEmployee from '#models/access_point_employee'
import type DeviceCommand from '#models/device_command'
import ConsentGate from '#modules/biometric-vault/consent/consent_gate'

function pivotOf(pin: string | null): AccessPointEmployee {
  return {
    accessPointEmployeeId: 5,
    accessPointId: 12,
    employeeId: 42,
    accessPointEmployeePin: pin,
  } as unknown as AccessPointEmployee
}

function makeService(options: { pin?: string | null; consented?: boolean } = {}) {
  const enqueued: EnqueueCommandInput[] = []
  const commands = {
    async enqueue(input: EnqueueCommandInput) {
      enqueued.push(input)
      return { command: { deviceCommandId: 99 } as DeviceCommand, created: true }
    },
  } as unknown as DeviceCommandPort

  const pivots = {
    async findPivot() {
      return options.pin === null ? pivotOf(null) : pivotOf(options.pin ?? '1042')
    },
  } as unknown as EmployeeSyncRepository

  const consent = {
    async assertGranted() {
      if (options.consented === false) {
        throw new BiometricVaultError(
          'El colaborador no ha firmado el consentimiento biometrico',
          'BVLT.CONSENT.001',
          422,
          'consentimiento-faltante'
        )
      }
      return { userConsentId: 1, legalDocumentId: 7, channel: 'digital', grantedAt: null }
    },
  } as unknown as ConsentGate

  return {
    service: new FingerprintEnrollmentService(commands, pivots, consent),
    enqueued,
  }
}

const INPUT = {
  accessPointId: 12,
  businessUnitId: 1,
  employeeId: 42,
  fingerId: 3,
  requestedByUserId: 8,
}

test.group('Enrolamiento remoto de huella', () => {
  test('encola la orden de capturar con el PIN del equipo y el dedo', async ({ assert }) => {
    const { service, enqueued } = makeService()
    const result = await service.request(INPUT)

    assert.isTrue(result.created)
    assert.lengthOf(enqueued, 1)
    assert.equal(enqueued[0].kind, 'enroll_fp')
    assert.deepEqual(enqueued[0].fields, { pin: '1042', fid: 3 })
    assert.equal(enqueued[0].accessPointEmployeeId, 5)
    // La llave lleva PIN y dedo: dos dedos distintos son dos enrolamientos.
    assert.equal(enqueued[0].correlationKey, 'enroll_fp:1042:3')
  })

  test('sin consentimiento no se encola nada', async ({ assert }) => {
    const { service, enqueued } = makeService({ consented: false })
    await assert.rejects(() => service.request(INPUT))
    assert.lengthOf(enqueued, 0)
  })

  /**
   * El orden importa: primero el consentimiento y despues el PIN. Al reves se
   * filtraria si alguien esta dado de alta en un equipo antes de comprobar si
   * se le puede tocar el biometrico.
   */
  test('sin consentimiento ni siquiera se mira si tiene PIN', async ({ assert }) => {
    let miroElPivote = false
    const commands = { async enqueue() {} } as unknown as DeviceCommandPort
    const pivots = {
      async findPivot() {
        miroElPivote = true
        return pivotOf('1042')
      },
    } as unknown as EmployeeSyncRepository
    const consent = {
      async assertGranted() {
        throw new BiometricVaultError('no', 'BVLT.CONSENT.001', 422, 'consentimiento-faltante')
      },
    } as unknown as ConsentGate

    const service = new FingerprintEnrollmentService(commands, pivots, consent)
    await assert.rejects(() => service.request(INPUT))
    assert.isFalse(miroElPivote)
  })

  test('sin PIN en ese equipo no hay a quien pedirle la huella', async ({ assert }) => {
    const { service, enqueued } = makeService({ pin: null })
    try {
      await service.request(INPUT)
      assert.fail('debio lanzar')
    } catch (error) {
      assert.equal((error as BiometricVaultError).key, 'sin-pin-en-el-equipo')
      assert.equal((error as BiometricVaultError).code, 'BVLT.PIN.001')
    }
    assert.lengthOf(enqueued, 0)
  })

  test('un dedo fuera del 0 al 9 no llega ni a la puerta de consentimiento', async ({ assert }) => {
    const { service, enqueued } = makeService()
    for (const fingerId of [-1, 10, 1.5]) {
      await assert.rejects(() => service.request({ ...INPUT, fingerId }))
    }
    assert.lengthOf(enqueued, 0)
  })

  test('el dedo 0 es valido: el equipo los numera desde cero', async ({ assert }) => {
    const { service, enqueued } = makeService()
    await service.request({ ...INPUT, fingerId: 0 })
    assert.equal(enqueued[0].fields.fid, 0)
    assert.equal(enqueued[0].correlationKey, 'enroll_fp:1042:0')
  })
})
