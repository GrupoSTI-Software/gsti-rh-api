import { test } from '@japa/runner'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkEmployeeBiometricFaceIdDeviceReadiness } from '#helpers/employee_biometric_face_id_device_readiness'
import type PhotoDerivativeService from '#modules/biometric-vault/photo/photo_derivative.service'
import type { DerivativeOutcome } from '#modules/biometric-vault/photo/photo_derivative.service'

async function tmpFile(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ebfi-'))
  const path = join(dir, 'photo.jpg')
  await writeFile(path, Buffer.from([0xff, 0xd8, 0xff]))
  return path
}

function derivativesReturning(outcome: DerivativeOutcome | Error): PhotoDerivativeService {
  return {
    async buildFromBuffer() {
      if (outcome instanceof Error) throw outcome
      return outcome
    },
  } as unknown as PhotoDerivativeService
}

test.group('Admision de la foto biometrica por la regla del checador', () => {
  test('una foto de la que sale un derivado valido entra', async ({ assert }) => {
    const check = await checkEmployeeBiometricFaceIdDeviceReadiness(
      await tmpFile(),
      derivativesReturning({ ok: true, buffer: Buffer.alloc(1), bytes: 1, verdict: 'ok' })
    )
    assert.isTrue(check.accepted)
  })

  test('una foto que el checador no puede usar se rechaza con 422, motivo y key', async ({
    assert,
  }) => {
    const check = await checkEmployeeBiometricFaceIdDeviceReadiness(
      await tmpFile(),
      derivativesReturning({ ok: false, verdict: 'resolution', detail: 'mide 480 por 480' })
    )
    assert.isFalse(check.accepted)
    if (check.accepted) return
    assert.equal(check.rejection.status, 422)
    assert.equal(check.rejection.body.code, 'EBFI.VAL.003')
    assert.equal(check.rejection.body.key, 'employee_biometric_face_id_not_device_ready')
    assert.equal(check.rejection.body.verdict, 'resolution')
    assert.equal(check.rejection.body.detail, 'mide 480 por 480')
  })

  /** Sin veredicto no hay garantia, pero tampoco se culpa a la foto. */
  test('si no se pudo evaluar responde 500 y no la deja entrar', async ({ assert }) => {
    const check = await checkEmployeeBiometricFaceIdDeviceReadiness(
      await tmpFile(),
      derivativesReturning(new Error('modelos no cargados'))
    )
    assert.isFalse(check.accepted)
    if (check.accepted) return
    assert.equal(check.rejection.status, 500)
    assert.equal(check.rejection.body.code, 'EBFI.SYS.001')
  })

  test('sin archivo temporal tampoco entra', async ({ assert }) => {
    const check = await checkEmployeeBiometricFaceIdDeviceReadiness(
      undefined,
      derivativesReturning({ ok: true, buffer: Buffer.alloc(1), bytes: 1, verdict: 'ok' })
    )
    assert.isFalse(check.accepted)
  })
})
