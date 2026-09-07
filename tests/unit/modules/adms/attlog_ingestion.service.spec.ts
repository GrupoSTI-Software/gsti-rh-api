import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import AttlogIngestionService, {
  type AttlogIngestionContext,
} from '#modules/adms/ingestion/attlog_ingestion.service'
import DeviceTimeService from '#modules/adms/ingestion/device_time.service'
import PinResolverService, {
  type PinResolution,
} from '#modules/adms/ingestion/pin_resolver.service'
import type {
  HeldPunchInput,
  HeldPunchRepository,
} from '#modules/adms/ingestion/held_punch.repository'
import type AssistIngestionService from '#modules/assist-ingestion/assist_ingestion.service'
import type {
  AssistIngestionItem,
  AssistIngestionResult,
} from '#modules/assist-ingestion/dto/assist_ingestion.dto'
import type IncidentService from '#modules/adms/raw/incident.service'
import type { IncidentInput, IncidentOutcome } from '#modules/adms/raw/incident.service'
import type { ResolvedAdmsDevice } from '#modules/adms/channel/adms_device_resolver.service'

const NOW = DateTime.fromISO('2026-08-12T15:00:00Z')

const DEVICE: ResolvedAdmsDevice = {
  accessPointId: 12,
  businessUnitId: 1,
  serial: 'SYZ8252500376',
  ip: '192.168.1.59',
  timezone: null,
  receivedAt: NOW,
}

const LINE = '9999\t2026-08-12 08:53:23\t0\t15\t0\t0\t0\t255\t0\t0\t'

function contextOf(overrides: Partial<AttlogIngestionContext> = {}): AttlogIngestionContext {
  return {
    device: DEVICE,
    body: `${LINE}\n`,
    rawMessageId: 77,
    layout: 'zam180',
    accessPointName: 'Entrada principal',
    deviceZone: null,
    businessUnitZone: 'America/Mexico_City',
    ...overrides,
  }
}

function makeService(resolution: PinResolution | ((pin: string) => PinResolution)) {
  const items: AssistIngestionItem[] = []
  const holds: HeldPunchInput[] = []
  const unmapped: string[] = []
  const incidents: IncidentInput[] = []
  const deferred: boolean[] = []

  const pins = {
    async resolve(input: { pin: string }) {
      return typeof resolution === 'function' ? resolution(input.pin) : resolution
    },
  } as unknown as PinResolverService

  const held: HeldPunchRepository = {
    async hold(input) {
      holds.push(input)
    },
    async touchUnmappedPin(input) {
      unmapped.push(input.pin)
      return 1
    },
  }

  const assists = {
    async ingest(
      incoming: AssistIngestionItem[],
      options?: { deferCalendarRecalc?: boolean }
    ): Promise<AssistIngestionResult> {
      items.push(...incoming)
      deferred.push(options?.deferCalendarRecalc === true)
      return {
        results: incoming.map((item, index) => ({
          index,
          clientRef: item.clientRef,
          outcome: 'inserted' as const,
          assist: null,
          error: null,
        })),
        summary: {
          received: incoming.length,
          inserted: incoming.length,
          preexisting: 0,
          rejected: 0,
          acknowledged: incoming.length,
        },
      }
    },
  } as unknown as AssistIngestionService

  const incidentService = {
    async record(input: IncidentInput): Promise<IncidentOutcome> {
      incidents.push(input)
      return 'created'
    },
  } as unknown as IncidentService

  const service = new AttlogIngestionService(
    pins,
    new DeviceTimeService(),
    held,
    assists,
    incidentService
  )
  return { service, items, holds, unmapped, incidents, deferred }
}

const EMPLOYEE: PinResolution = {
  kind: 'employee',
  employeeId: 77,
  employeeCode: 'EMP-77',
  pinInferred: false,
}

test.group('ADMS attlog ingestion', () => {
  test('una checada atribuible entra al motor con hora en UTC, serie y alias', async ({
    assert,
  }) => {
    const { service, items, deferred, incidents } = makeService(EMPLOYEE)
    const result = await service.ingest(contextOf())

    assert.equal(result.status, 'processed')
    assert.equal(result.inserted, 1)
    assert.equal(result.held, 0)
    assert.lengthOf(items, 1)
    assert.deepEqual(items[0].subject, {
      kind: 'employeeCode',
      employeeCode: 'EMP-77',
      businessUnitId: 1,
    })
    assert.equal(items[0].punchTimeUtc.toISO({ suppressMilliseconds: true }), '2026-08-12T14:53:23Z')
    assert.equal(items[0].terminalSn, 'SYZ8252500376')
    assert.equal(items[0].terminalAlias, 'Entrada principal')
    assert.equal(items[0].verifyMethod, 15)
    assert.equal(items[0].origin, 'adms')
    assert.isNull(items[0].assistType)
    // El recalculo NO puede correr dentro de la peticion del checador.
    assert.deepEqual(deferred, [true])
    assert.lengthOf(incidents, 0)
  })

  test('un PIN desconocido se retiene y entra a la cola de conciliacion', async ({ assert }) => {
    const { service, items, holds, unmapped } = makeService({
      kind: 'held',
      reason: 'unknown_pin',
    })
    const result = await service.ingest(contextOf())

    assert.equal(result.status, 'partial')
    assert.equal(result.held, 1)
    assert.lengthOf(items, 0)
    assert.lengthOf(holds, 1)
    assert.equal(holds[0].pin, '9999')
    assert.equal(holds[0].reason, 'unknown_pin')
    assert.equal(holds[0].verify, 15)
    assert.equal(holds[0].rawMessageId, 77)
    assert.deepEqual(unmapped, ['9999'])
  })

  test('un colaborador dado de baja se retiene y no entra a la cola de PINs', async ({
    assert,
  }) => {
    const { service, items, holds, unmapped } = makeService({
      kind: 'held',
      reason: 'employee_terminated',
    })
    const result = await service.ingest(contextOf())

    assert.equal(result.held, 1)
    assert.lengthOf(items, 0)
    assert.equal(holds[0].reason, 'employee_terminated')
    // No es un PIN sin dueno: se sabe de quien es, no procede conciliar.
    assert.lengthOf(unmapped, 0)
  })

  test('una linea ilegible deja incidente y no impide las demas', async ({ assert }) => {
    const { service, items, incidents } = makeService(EMPLOYEE)
    const result = await service.ingest(
      contextOf({ body: `${LINE}\nbasura\n9998\t2026-08-12 09:00:00\t0\t1\n` })
    )

    assert.equal(result.status, 'partial')
    assert.equal(result.unparsed, 1)
    assert.lengthOf(items, 2)
    assert.equal(incidents[0].kind, 'parse_error')
    assert.equal(incidents[0].context?.lines, 1)
  })

  test('sin plataforma conocida se avisa una vez y las checadas siguen entrando', async ({
    assert,
  }) => {
    const { service, items, incidents } = makeService(EMPLOYEE)
    const result = await service.ingest(contextOf({ layout: null }))

    assert.lengthOf(items, 1)
    assert.equal(items[0].verifyMethod, 15)
    assert.equal(incidents[0].kind, 'unknown_layout')
    assert.equal(result.status, 'processed')
  })

  test('una zona invalida no detiene la ingesta pero deja incidente', async ({ assert }) => {
    const { service, items, incidents } = makeService(EMPLOYEE)
    const result = await service.ingest(contextOf({ businessUnitZone: 'America/Noexiste' }))

    assert.lengthOf(items, 1)
    assert.equal(result.inserted, 1)
    assert.equal(incidents[0].kind, 'timezone_invalid')
  })

  test('un cuerpo sin lineas legibles no llama al motor', async ({ assert }) => {
    const { service, items, incidents } = makeService(EMPLOYEE)
    const result = await service.ingest(contextOf({ body: 'basura\n' }))

    assert.lengthOf(items, 0)
    assert.equal(result.status, 'partial')
    assert.equal(result.unparsed, 1)
    assert.equal(incidents[0].kind, 'parse_error')
  })
})
