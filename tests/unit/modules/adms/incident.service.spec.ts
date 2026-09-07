import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import IncidentService from '#modules/adms/raw/incident.service'
import type { IncidentRepository, IncidentRecord } from '#modules/adms/raw/incident.repository'
import type { AdmsIncidentContext } from '#models/adms_incident'
import { ADMS_INCIDENT_KIND } from '#modules/adms/adms.constants'
import { ADMS_ERROR_CODES } from '#constants/adms_error_codes'

function makeRepository(existing: IncidentRecord[] = []) {
  const inserted: IncidentRecord[] = []
  const repository: IncidentRepository = {
    async findOpenSince(kind, scope, since) {
      return (
        existing.find(
          (row) =>
            row.kind === kind &&
            row.serial === scope.serial &&
            row.accessPointId === scope.accessPointId &&
            row.createdAt >= since
        ) ?? null
      )
    },
    async insert(record) {
      inserted.push(record)
      return inserted.length
    },
  }
  return { repository, inserted }
}

test.group('ADMS incident service', () => {
  test('crea el incidente con triplete y contexto por lista blanca', async ({ assert }) => {
    const { repository, inserted } = makeRepository()
    const service = new IncidentService(repository)
    const outcome = await service.record({
      kind: ADMS_INCIDENT_KIND.UNKNOWN_TABLE,
      severity: 'warning',
      code: ADMS_ERROR_CODES.VAL_LINE_UNPARSEABLE,
      title: 'Tabla desconocida',
      detail: 'El equipo subio una tabla que el canal no atiende.',
      key: 'tabla-desconocida',
      serial: 'SYZ8252500376',
      accessPointId: 12,
      businessUnitId: 1,
      // Cast deliberado: el tipo ya no admite `name`, pero el contexto puede
      // llegar de un JSON externo. La lista blanca debe descartarlo en runtime.
      context: { table: 'FOO', lines: 3, name: 'NO DEBE PASAR' } as AdmsIncidentContext,
      now: DateTime.utc(),
    })
    assert.equal(outcome, 'created')
    assert.lengthOf(inserted, 1)
    assert.equal(inserted[0].key, 'tabla-desconocida')
    assert.deepEqual(inserted[0].context, { table: 'FOO', lines: 3 })
  })

  test('con dedupe no repite el mismo incidente abierto dentro de la ventana', async ({
    assert,
  }) => {
    const now = DateTime.utc()
    const { repository, inserted } = makeRepository([
      {
        kind: ADMS_INCIDENT_KIND.DEVICE_INACTIVE,
        severity: 'warning',
        code: ADMS_ERROR_CODES.DEV_INACTIVE,
        title: 't',
        detail: 'd',
        key: 'k',
        serial: 'SYZ8252500376',
        accessPointId: 12,
        businessUnitId: 1,
        rawMessageId: null,
        deviceCommandId: null,
        context: null,
        createdAt: now.minus({ minutes: 20 }),
      },
    ])
    const service = new IncidentService(repository)
    const outcome = await service.record(
      {
        kind: ADMS_INCIDENT_KIND.DEVICE_INACTIVE,
        severity: 'warning',
        code: ADMS_ERROR_CODES.DEV_INACTIVE,
        title: 't',
        detail: 'd',
        key: 'k',
        serial: 'SYZ8252500376',
        accessPointId: 12,
        businessUnitId: 1,
        now,
      },
      { dedupeMinutes: 60 }
    )
    assert.equal(outcome, 'deduped')
    assert.lengthOf(inserted, 0)
  })
})
