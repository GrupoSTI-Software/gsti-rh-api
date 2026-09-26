import { test } from '@japa/runner'
import DeviceTimeService from '#modules/adms/ingestion/device_time.service'

test.group('ADMS device time', () => {
  test('la zona del dispositivo gana sobre la de la empresa', ({ assert }) => {
    const service = new DeviceTimeService()
    assert.deepEqual(service.resolveZone('America/Tijuana', 'America/Mexico_City'), {
      zone: 'America/Tijuana',
      fellBack: false,
    })
    assert.deepEqual(service.resolveZone(null, 'America/Mexico_City'), {
      zone: 'America/Mexico_City',
      fellBack: false,
    })
  })

  test('una zona invalida no retiene nada: cae a la del sistema y avisa', ({ assert }) => {
    const service = new DeviceTimeService()
    const resolved = service.resolveZone('America/Noexiste', 'America/Mexico_City')
    assert.isTrue(resolved.fellBack)
    assert.isNotEmpty(resolved.zone)
    const vacio = service.resolveZone(null, '   ')
    assert.isFalse(vacio.fellBack)
  })

  test('la hora local se convierte a UTC real', ({ assert }) => {
    const service = new DeviceTimeService()
    // Agosto en Ciudad de Mexico: UTC-6 desde 2022 (sin horario de verano).
    const result = service.toUtc('2026-08-12 08:53:23', 'America/Mexico_City')
    assert.isTrue(result.ok)
    if (!result.ok) return
    assert.equal(result.utc.toISO({ suppressMilliseconds: true }), '2026-08-12T14:53:23Z')
    assert.equal(result.utc.zoneName, 'UTC')
  })

  test('una zona con desfase distinto produce otro instante', ({ assert }) => {
    const service = new DeviceTimeService()
    const tijuana = service.toUtc('2026-08-12 08:53:23', 'America/Tijuana')
    assert.isTrue(tijuana.ok)
    if (!tijuana.ok) return
    assert.equal(tijuana.utc.toISO({ suppressMilliseconds: true }), '2026-08-12T15:53:23Z')
  })

  test('una hora fuera de formato no revienta: se reporta', ({ assert }) => {
    const service = new DeviceTimeService()
    const result = service.toUtc('12/08/2026 08:53', 'America/Mexico_City')
    assert.isFalse(result.ok)
    if (result.ok) return
    assert.equal(result.reason, 'invalid_time')
  })
})
