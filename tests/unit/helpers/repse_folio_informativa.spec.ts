import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { buildInformativaExpirationSnapshot } from '#constants/repse_folio_aviso'

test.group('buildInformativaExpirationSnapshot', () => {
  test('desde julio apunta al 17 de septiembre del mismo año', ({ assert }) => {
    const today = DateTime.fromISO('2026-07-21', { zone: 'America/Mexico_City' })
    const snapshot = buildInformativaExpirationSnapshot(today)

    assert.equal(snapshot.presentationDate, '2026-09-17')
    assert.equal(snapshot.daysRemaining, 58)
  })

  test('desde octubre apunta al 17 de enero del año siguiente', ({ assert }) => {
    const today = DateTime.fromISO('2026-10-01', { zone: 'America/Mexico_City' })
    const snapshot = buildInformativaExpirationSnapshot(today)

    assert.equal(snapshot.presentationDate, '2027-01-17')
    assert.isAbove(snapshot.daysRemaining, 0)
  })
})
