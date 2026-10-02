import { test } from '@japa/runner'
import {
  parseAssistLocation,
  resolveAssistSourceKind,
  resolveDeviceChannel,
  resolveVerifyMethod,
} from '#modules/assist-source/assist_source.rules'

const facts = (overrides: Partial<Parameters<typeof resolveAssistSourceKind>[0]> = {}) => ({
  origin: null,
  terminalSerialNumber: null,
  createdByUserId: null,
  hasLocation: false,
  ...overrides,
})

test.group('Origen de la checada — reglas', () => {
  test('el origen declarado decide el medio', ({ assert }) => {
    assert.equal(resolveAssistSourceKind(facts({ origin: 'adms' })), 'device')
    assert.equal(resolveAssistSourceKind(facts({ origin: 'sync' })), 'device')
    assert.equal(resolveAssistSourceKind(facts({ origin: 'admin-capture' })), 'backoffice')
    assert.equal(
      resolveAssistSourceKind(facts({ origin: 'self-service', hasLocation: true })),
      'app'
    )
  })

  test('sin origen, los históricos se reconocen por serie, captura o coordenadas', ({ assert }) => {
    assert.equal(
      resolveAssistSourceKind(facts({ terminalSerialNumber: 'CQUF222760148' })),
      'device'
    )
    assert.equal(resolveAssistSourceKind(facts({ createdByUserId: 7 })), 'backoffice')
    assert.equal(resolveAssistSourceKind(facts({ hasLocation: true })), 'app')
    assert.equal(resolveAssistSourceKind(facts()), 'unknown')
  })

  test('canal y método de verificación del checador', ({ assert }) => {
    assert.equal(resolveDeviceChannel('adms'), 'adms')
    assert.equal(resolveDeviceChannel(null), 'biotime')
    assert.equal(resolveVerifyMethod(1), 'fingerprint')
    assert.equal(resolveVerifyMethod(15), 'face')
    assert.equal(resolveVerifyMethod(4), 'other')
    assert.isNull(resolveVerifyMethod(null))
  })

  test('las coordenadas vacías, en cero o fuera de rango no son una ubicación', ({ assert }) => {
    assert.deepEqual(parseAssistLocation('20.673822', '-103.385461', '8.4'), {
      latitude: 20.673822,
      longitude: -103.385461,
      precisionMeters: 8.4,
    })
    assert.isNull(parseAssistLocation(null, null, null))
    assert.isNull(parseAssistLocation('', '', null))
    assert.isNull(parseAssistLocation(0, 0, null))
    assert.isNull(parseAssistLocation(120, 10, null))
    assert.isNull(parseAssistLocation('20.6', '-103.3', null)?.precisionMeters)
  })
})
