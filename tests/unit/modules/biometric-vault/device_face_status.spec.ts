import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import {
  resolveFacePhotoStatus,
  type FaceCommandView,
} from '#modules/biometric-vault/photo/device_face_status'

const T0 = DateTime.fromISO('2026-09-30T12:00:00Z')

function cmd(id: number, status: string, extra: Partial<FaceCommandView> = {}): FaceCommandView {
  return { id, status, lastError: null, executedAt: null, failedAt: null, updatedAt: T0, ...extra }
}

const base = {
  deviceUse: true,
  support: 'supported' as const,
  latestWrite: null,
  latestDelete: null,
  faceCountZeroSince: null,
}

test.group('Estado de la foto en un checador', () => {
  test('sin uso en checadores y sin movimientos no hay nada que reportar', ({ assert }) => {
    assert.isNull(resolveFacePhotoStatus({ ...base, deviceUse: false }))
  })

  test('uso encendido sin envio a ese equipo', ({ assert }) => {
    assert.equal(resolveFacePhotoStatus(base)?.status, 'not_sent')
  })

  test('un equipo sin rostro se nombra como tal', ({ assert }) => {
    assert.equal(resolveFacePhotoStatus({ ...base, support: 'unsupported' })?.status, 'unsupported')
  })

  test('en cola, en vuelo o acusada sin prueba es envio en curso', ({ assert }) => {
    for (const status of ['pending', 'sent', 'acked']) {
      assert.equal(
        resolveFacePhotoStatus({ ...base, latestWrite: cmd(1, status) })?.status,
        'sending'
      )
    }
  })

  test('ejecutada es cargada', ({ assert }) => {
    const status = resolveFacePhotoStatus({
      ...base,
      latestWrite: cmd(1, 'executed', { executedAt: T0 }),
    })
    assert.equal(status?.status, 'loaded')
  })

  test('fallida lleva su motivo', ({ assert }) => {
    const status = resolveFacePhotoStatus({
      ...base,
      latestWrite: cmd(1, 'failed', { lastError: 'no_evidence', failedAt: T0 }),
    })
    assert.deepInclude(status, { status: 'failed', reason: 'no_evidence' })
  })

  /** El contador del aparato es la unica palabra que vale sobre su contenido. */
  test('cargada pero el equipo declara cero rostros despues: fallida', ({ assert }) => {
    const status = resolveFacePhotoStatus({
      ...base,
      latestWrite: cmd(1, 'executed', { executedAt: T0 }),
      faceCountZeroSince: T0.plus({ hours: 1 }),
    })
    assert.deepInclude(status, { status: 'failed', reason: 'device_reports_no_faces' })
  })

  test('el borrado posterior manda sobre el envio', ({ assert }) => {
    const write = cmd(1, 'executed', { executedAt: T0 })
    assert.equal(
      resolveFacePhotoStatus({ ...base, deviceUse: false, latestWrite: write, latestDelete: cmd(2, 'pending') })
        ?.status,
      'removing'
    )
    assert.isNull(
      resolveFacePhotoStatus({ ...base, deviceUse: false, latestWrite: write, latestDelete: cmd(2, 'executed') })
    )
    assert.equal(
      resolveFacePhotoStatus({ ...base, deviceUse: false, latestWrite: write, latestDelete: cmd(2, 'failed') })
        ?.status,
      'remove_failed'
    )
  })

  test('un envio posterior al borrado manda sobre el borrado', ({ assert }) => {
    const status = resolveFacePhotoStatus({
      ...base,
      latestDelete: cmd(1, 'executed'),
      latestWrite: cmd(2, 'pending'),
    })
    assert.equal(status?.status, 'sending')
  })
})
