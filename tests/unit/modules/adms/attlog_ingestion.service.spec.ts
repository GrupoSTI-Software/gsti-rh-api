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
import { ASSIST_INGESTION_EMPLOYEE_TERMINATED } from '#modules/assist-ingestion/assist_ingestion.rejections'
import type DeviceClockService from '#modules/access-point/device-clock/device_clock.service'
import type DeviceClockSyncService from '#modules/access-point/device-clock/device_clock_sync.service'

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

interface ServiceOptions {
  /** Deriva que devuelve el reloj doblado, en segundos. */
  clockMedian?: number
  /**
   * Desenlace del doble de `assists`.
   *
   * Con `inserted` --el de siempre-- la rama de rescate del rechazo no se
   * ejerce nunca, y es la que decide si una checada se retiene o se pierde.
   */
  ingestOutcome?: 'inserted' | 'rejected'
}

function makeService(
  resolution: PinResolution | ((pin: string) => PinResolution),
  options: ServiceOptions = {}
) {
  /** Que contesta el doble de `assists`: por defecto, todo entra. */
  const ingestOutcome = options.ingestOutcome ?? 'inserted'
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
      ingestOptions?: { deferCalendarRecalc?: boolean }
    ): Promise<AssistIngestionResult> {
      items.push(...incoming)
      deferred.push(ingestOptions?.deferCalendarRecalc === true)
      const rejected = ingestOutcome === 'rejected'
      return {
        results: incoming.map((item, index) => ({
          index,
          clientRef: item.clientRef,
          outcome: ingestOutcome,
          assist: null,
          error: rejected ? ASSIST_INGESTION_EMPLOYEE_TERMINATED : null,
        })),
        summary: {
          received: incoming.length,
          inserted: rejected ? 0 : incoming.length,
          preexisting: 0,
          rejected: rejected ? incoming.length : 0,
          acknowledged: rejected ? 0 : incoming.length,
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

  /**
   * El reloj se dobla a proposito: sin doble, su error se lo tragaria el
   * try/catch de la ingesta y la prueba pasaria sin comprobar el enganche.
   */
  const clockObservations: number[][] = []
  const clock = {
    async observe(input: { samples: number[] }) {
      clockObservations.push(input.samples)
      return {
        medianSeconds: options.clockMedian ?? 0,
        driftDetected: (options.clockMedian ?? 0) > 60,
        dstSuspected: false,
        discarded: 0,
      }
    },
  } as unknown as DeviceClockService

  const clockRequests: string[] = []
  const clockConfirms: number[] = []
  const clockSync = {
    async request(input: { deviceZone: string | null }) {
      clockRequests.push(input.deviceZone ?? 'sin-zona')
      return { kind: 'enqueued' as const }
    },
    async confirmFromDrift(input: { accessPointId: number }) {
      clockConfirms.push(input.accessPointId)
      return null
    },
  } as unknown as DeviceClockSyncService

  const service = new AttlogIngestionService(
    pins,
    new DeviceTimeService(),
    held,
    assists,
    incidentService,
    clock,
    clockSync
  )
  return {
    service,
    items,
    holds,
    unmapped,
    incidents,
    deferred,
    clockObservations,
    clockRequests,
    clockConfirms,
  }
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
    /**
     * Por identificador. El resolutor de PIN ya decidio de quien es la checada;
     * mandar el codigo obligaria a resolver otra vez, y dos colaboradores con
     * el mismo codigo se acreditarian el tiempo del otro.
     */
    assert.deepEqual(items[0].subject, { kind: 'employeeId', employeeId: 77 })
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

  test('el reloj se observa una vez por subida, no una por linea', async ({ assert }) => {
    const { service, clockObservations, clockConfirms } = makeService(EMPLOYEE)
    await service.ingest(
      contextOf({ body: `${LINE}\n9998\t2026-08-12 08:54:00\t0\t1\n9997\t2026-08-12 08:55:00\t0\t1\n` })
    )
    assert.lengthOf(clockObservations, 1)
    assert.lengthOf(clockObservations[0], 3)
    // Sin deriva, una checada buena confirma un ajuste que estuviera esperando.
    assert.deepEqual(clockConfirms, [12])
  })

  test('con deriva se pide el ajuste con la zona de la sede', async ({ assert }) => {
    const { service, clockRequests, clockConfirms } = makeService(EMPLOYEE, { clockMedian: 300 })
    await service.ingest(contextOf())
    assert.deepEqual(clockRequests, ['America/Mexico_City'])
    assert.lengthOf(clockConfirms, 0)
  })

  test('un lote sin checadas atribuibles no observa el reloj', async ({ assert }) => {
    const { service, clockObservations } = makeService({ kind: 'held', reason: 'unknown_pin' })
    await service.ingest(contextOf())
    // El PIN no resolvio, pero la hora si: la muestra sirve igual.
    assert.lengthOf(clockObservations, 1)
  })

  /**
   * Una fecha que existe en el regex pero no en el calendario. Es el UNICO
   * punto de toda la ingesta donde una checada no llega ni a `assists` ni a la
   * retencion, y no habia una sola prueba que lo ejerciera.
   *
   * La linea no se pierde del sistema --el cuerpo crudo se guarda-- pero si del
   * flujo de checadas, asi que el incidente es lo unico que queda: tiene que
   * decir de que PIN y de que hora se trata, no solo cuantas fueron.
   */
  test('una hora imposible no entra al motor y deja constancia con su PIN', async ({ assert }) => {
    const { service, items, holds, incidents } = makeService(EMPLOYEE)
    const result = await service.ingest(
      contextOf({ body: '9999\t2026-02-30 08:00:00\t0\t15\t0\t0\t0\t255\t0\t0\t\n' })
    )

    assert.lengthOf(items, 0)
    assert.lengthOf(holds, 0)
    assert.equal(result.status, 'partial')

    const aviso = incidents.find((incident) => incident.key === 'hora-ilegible')
    assert.exists(aviso)
    assert.equal(aviso?.context?.lines, 1)
    assert.equal(aviso?.context?.pin, '9999')
    assert.equal(aviso?.context?.reason, '2026-02-30 08:00:00')
  })

  /**
   * El doble de `assists` siempre contestaba `inserted`, asi que la rama de
   * rescate no se ejercia nunca. Es la que decide si una checada rechazada por
   * el motor se retiene o se pierde.
   */
  test('una checada que el motor rechaza se retiene, no se tira', async ({ assert }) => {
    const { service, holds } = makeService(EMPLOYEE, { ingestOutcome: 'rejected' })
    const result = await service.ingest(contextOf())

    assert.lengthOf(holds, 1)
    assert.equal(holds[0].pin, '9999')
    assert.equal(holds[0].reason, 'ingestion_rejected')
    assert.equal(result.held, 1)
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
