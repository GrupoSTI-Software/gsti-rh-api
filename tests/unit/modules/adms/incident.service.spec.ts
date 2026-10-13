import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import IncidentService from '#modules/adms/raw/incident.service'
import type { IncidentRepository, IncidentRecord } from '#modules/adms/raw/incident.repository'
import type { AdmsIncidentContext } from '#models/adms_incident'
import { ADMS_INCIDENT_KIND } from '#modules/adms/adms.constants'
import { ADMS_ERROR_CODES } from '#constants/adms_error_codes'

function makeRepository(existing: IncidentRecord[] = []) {
  const inserted: IncidentRecord[] = []
  const resolved: IncidentRecord[] = []
  const repository: IncidentRepository = {
    async findRecentSince(kind, scope, since, context) {
      return (
        existing.find(
          (row) =>
            row.kind === kind &&
            row.serial === scope.serial &&
            row.accessPointId === scope.accessPointId &&
            row.createdAt >= since &&
            (context?.pin === undefined || row.context?.pin === context.pin) &&
            (context?.bioNo === undefined || row.context?.bioNo === context.bioNo)
        ) ?? null
      )
    },
    async insert(record) {
      inserted.push(record)
      return inserted.length
    },
    async hasOpen() {
      return false
    },
    async resolveOpen(kind, accessPointId, _now, context) {
      const abiertos = existing.filter(
        (row) =>
          row.kind === kind &&
          row.accessPointId === accessPointId &&
          (context?.pin === undefined || row.context?.pin === context.pin) &&
          (context?.bioNo === undefined || row.context?.bioNo === context.bioNo)
      )
      resolved.push(...abiertos)
      return abiertos.length
    },
  }
  return { repository, inserted, resolved }
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
      context: { table: 'FOO', lines: 3, bioNo: 5, name: 'NO DEBE PASAR' } as AdmsIncidentContext,
      now: DateTime.utc(),
    })
    assert.equal(outcome, 'created')
    assert.lengthOf(inserted, 1)
    assert.equal(inserted[0].key, 'tabla-desconocida')
    assert.deepEqual(inserted[0].context, { table: 'FOO', lines: 3, bioNo: 5 })
  })

  /**
   * El aviso de huella sin repartir es por colaborador y dedo: dos personas
   * enroladas en el mismo equipo dentro de la ventana son dos avisos, y copiar
   * el dedo de una no cierra el de la otra.
   */
  test('con dedupeBy la ventana se acota al PIN y al dedo del contexto', async ({ assert }) => {
    const now = DateTime.fromISO('2026-10-12T21:00:00Z')
    const previo: IncidentRecord = {
      kind: ADMS_INCIDENT_KIND.FINGERPRINT_NOT_SPREAD,
      severity: 'info',
      code: 'ADMS.BIO.002',
      title: 'Huella capturada en el equipo sin orden del sistema',
      detail: 'x',
      key: 'huella-sin-repartir',
      serial: 'S1',
      accessPointId: 32,
      businessUnitId: 7,
      rawMessageId: null,
      deviceCommandId: null,
      context: { pin: '1', bioNo: 5 },
      createdAt: now.minus({ minutes: 10 }),
    }
    const { repository, inserted } = makeRepository([previo])
    const service = new IncidentService(repository)
    const base = {
      kind: ADMS_INCIDENT_KIND.FINGERPRINT_NOT_SPREAD,
      severity: 'info' as const,
      code: 'ADMS.BIO.002',
      title: 'Huella capturada en el equipo sin orden del sistema',
      detail: 'x',
      key: 'huella-sin-repartir',
      serial: 'S1',
      accessPointId: 32,
      businessUnitId: 7,
      now,
    }
    const options = { dedupeMinutes: 60, dedupeBy: ['pin', 'bioNo'] as Array<'pin' | 'bioNo'> }

    // Misma persona, mismo dedo: se repite y se deduplica.
    assert.equal(await service.record({ ...base, context: { pin: '1', bioNo: 5 } }, options), 'deduped')
    // Otra persona en el mismo equipo y la misma hora: es otro aviso.
    assert.equal(await service.record({ ...base, context: { pin: '2', bioNo: 5 } }, options), 'created')
    // Otro dedo de la misma persona: tambien.
    assert.equal(await service.record({ ...base, context: { pin: '1', bioNo: 6 } }, options), 'created')
    assert.lengthOf(inserted, 2)
  })

  test('cerrar por causa resuelta con contexto solo toca el aviso de ese PIN y dedo', async ({
    assert,
  }) => {
    const now = DateTime.fromISO('2026-10-12T21:00:00Z')
    const avisoDe = (pin: string, bioNo: number): IncidentRecord => ({
      kind: ADMS_INCIDENT_KIND.FINGERPRINT_NOT_SPREAD,
      severity: 'info',
      code: 'ADMS.BIO.002',
      title: 'x',
      detail: 'x',
      key: 'huella-sin-repartir',
      serial: 'S1',
      accessPointId: 32,
      businessUnitId: 7,
      rawMessageId: null,
      deviceCommandId: null,
      context: { pin, bioNo },
      createdAt: now.minus({ minutes: 10 }),
    })
    const { repository, resolved } = makeRepository([avisoDe('1', 5), avisoDe('2', 5)])
    const service = new IncidentService(repository)

    const closed = await service.resolveResolvedCause(
      ADMS_INCIDENT_KIND.FINGERPRINT_NOT_SPREAD,
      32,
      now,
      { pin: '1', bioNo: 5 }
    )
    assert.equal(closed, 1)
    assert.deepEqual(resolved.map((row) => row.context?.pin), ['1'])
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

  test('cierra los avisos cuya causa ya se resolvio', async ({ assert }) => {
    const abierto: IncidentRecord = {
      kind: ADMS_INCIDENT_KIND.UNKNOWN_LAYOUT,
      severity: 'warning',
      code: ADMS_ERROR_CODES.VAL_LAYOUT_UNKNOWN,
      title: 'Disposicion de checadas no validada',
      detail: 'El equipo no ha declarado una plataforma conocida.',
      key: 'disposicion-desconocida',
      serial: null,
      accessPointId: 7,
      businessUnitId: 3,
      rawMessageId: null,
      deviceCommandId: null,
      context: null,
      createdAt: DateTime.utc(),
    }
    const { repository, resolved } = makeRepository([abierto])
    const service = new IncidentService(repository)

    const cerrados = await service.resolveResolvedCause(
      ADMS_INCIDENT_KIND.UNKNOWN_LAYOUT,
      7,
      DateTime.utc()
    )

    assert.equal(cerrados, 1)
    assert.lengthOf(resolved, 1)
  })

  test('no toca los avisos de otro equipo', async ({ assert }) => {
    const ajeno: IncidentRecord = {
      kind: ADMS_INCIDENT_KIND.UNKNOWN_LAYOUT,
      severity: 'warning',
      code: ADMS_ERROR_CODES.VAL_LAYOUT_UNKNOWN,
      title: 'Disposicion de checadas no validada',
      detail: 'El equipo no ha declarado una plataforma conocida.',
      key: 'disposicion-desconocida',
      serial: null,
      accessPointId: 9,
      businessUnitId: 3,
      rawMessageId: null,
      deviceCommandId: null,
      context: null,
      createdAt: DateTime.utc(),
    }
    const { repository, resolved } = makeRepository([ajeno])
    const service = new IncidentService(repository)

    const cerrados = await service.resolveResolvedCause(
      ADMS_INCIDENT_KIND.UNKNOWN_LAYOUT,
      7,
      DateTime.utc()
    )

    assert.equal(cerrados, 0)
    assert.lengthOf(resolved, 0)
  })
})
