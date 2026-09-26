import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { ASSIST_CHANNEL, ASSIST_ORIGIN } from '#constants/assist_origin'
import {
  ASSIST_NATURAL_KEY_CHANNEL_SENTINEL,
  assistChannelSentinel,
  computeAssistNaturalKey,
} from '#utils/assist_natural_key'

/**
 * USRH1788135907801 — el canal entra en la identidad de la checada.
 * Los hashes son los controles del spec: no se recalculan, se verifican.
 */

const BUSINESS_UNIT_ID = 3
const EMPLOYEE_CODE = 'EMP001'
const PUNCH_TIME = DateTime.fromISO('2026-08-30T14:05:00', { zone: 'utc' })

function keyFor(terminalSn: string): string {
  return computeAssistNaturalKey({
    businessUnitId: BUSINESS_UNIT_ID,
    assistEmpCode: EMPLOYEE_CODE,
    assistPunchTimeUtc: PUNCH_TIME,
    assistTerminalSn: terminalSn,
  })
}

test.group('Assist — centinela de canal en la llave natural (USRH1788135907801)', () => {
  test('CA-5 · una serie real conserva exactamente su llave previa', ({ assert }) => {
    // El criterio más caro de la rebanada: si falla, la siguiente sincronización de
    // BioTime duplica todo el histórico.
    const serialNumber = 'SYZ8252500376'

    assert.equal(assistChannelSentinel(ASSIST_ORIGIN.SYNC, serialNumber), serialNumber)
    assert.equal(assistChannelSentinel(ASSIST_ORIGIN.SELF_SERVICE, serialNumber), serialNumber)
    assert.equal(assistChannelSentinel(null, serialNumber), serialNumber)
    assert.equal(
      keyFor(assistChannelSentinel(ASSIST_ORIGIN.SYNC, serialNumber)),
      '998133a3bff3fb7ec308e5b5c499f4a752a50b035e2e78d884ada429f42c1ac2'
    )
  })

  test('CA-8 · sin serie y sin canal derivable la llave histórica no cambia', ({ assert }) => {
    assert.equal(assistChannelSentinel(null, null), ASSIST_NATURAL_KEY_CHANNEL_SENTINEL.UNKNOWN)
    assert.equal(assistChannelSentinel(null, ''), ASSIST_NATURAL_KEY_CHANNEL_SENTINEL.UNKNOWN)
    assert.equal(assistChannelSentinel(ASSIST_ORIGIN.MANUAL, ''), '__NO_SN__')
    assert.equal(
      keyFor(assistChannelSentinel(null, '')),
      '9961c421c9e4cc9c9ab95b62e211267d8d4e814254b430dba9d039e5ecea8a7a'
    )
  })

  test('CA-4 · app, kiosco y backoffice del mismo segundo dan tres llaves distintas', ({
    assert,
  }) => {
    const app = keyFor(assistChannelSentinel(ASSIST_ORIGIN.SELF_SERVICE, null))
    const kiosk = keyFor(assistChannelSentinel(ASSIST_ORIGIN.DEVICE, null))
    const backoffice = keyFor(assistChannelSentinel(ASSIST_ORIGIN.ADMIN_CAPTURE, null))

    assert.equal(app, '7bb6d4e95b0cc338c0ab6d5824b49fdb415e774799abc86a9f04cd25444e3817')
    assert.equal(kiosk, 'd6a1785657839f026e0a5e5721e9849b67b7eabdff931e9762eacaabb6aea43e')
    assert.equal(backoffice, '5b0a99f325a3b193d3f17723ceda184a56e25ff7cfe1cd932c7cd790182e0fd3')
    assert.lengthOf(new Set([app, kiosk, backoffice]), 3)
  })

  test('el canal es vocabulario cerrado de cuatro valores', ({ assert }) => {
    assert.deepEqual(Object.values(ASSIST_CHANNEL), ['app', 'kiosk', 'backoffice', 'device'])
  })

  test('CA-12 · el hook y los dos comandos calculan la llave con el mismo helper', ({ assert }) => {
    const sources = [
      'app/models/assist.ts',
      'commands/backfill_assist_natural_key.ts',
      'commands/assist_tenant_trial.ts',
    ]

    for (const source of sources) {
      const content = readFileSync(join(process.cwd(), source), 'utf-8')
      assert.include(content, 'assistChannelSentinel(', `${source} debe usar el centinela`)
      assert.include(content, 'computeAssistNaturalKey', `${source} no reimplementa el hash`)
    }
  })
})
