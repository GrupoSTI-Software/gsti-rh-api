import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import AdmsChannelService, {
  type UploadInput,
} from '#modules/adms/channel/adms_channel.service'
import type {
  RawMessageFinish,
  RawMessageInsert,
  RawMessageRepository,
} from '#modules/adms/raw/raw_message.repository'
import type {
  StampAdvance,
  UploadProgressRepository,
} from '#modules/access-point/upload-progress/upload_progress.repository'
import type { DeviceProfileRepository } from '#modules/access-point/device-profile/device_profile.repository'
import type IncidentService from '#modules/adms/raw/incident.service'
import type { IncidentInput, IncidentOutcome } from '#modules/adms/raw/incident.service'
import type { ResolvedAdmsDevice } from '#modules/adms/channel/adms_device_resolver.service'
import type DeviceProfileService from '#modules/access-point/device-profile/device_profile.service'
import type AttlogIngestionService from '#modules/adms/ingestion/attlog_ingestion.service'
import type AccessPointProfile from '#models/access_point_profile'

const NOW = DateTime.fromISO('2026-09-07T12:00:00Z')

const DEVICE: ResolvedAdmsDevice = {
  accessPointId: 12,
  businessUnitId: 1,
  serial: 'SYZ8252500376',
  ip: '192.168.1.59',
  timezone: null,
  receivedAt: NOW,
  configuredAt: null,
}

function uploadOf(overrides: Partial<UploadInput> = {}): UploadInput {
  return {
    device: DEVICE,
    method: 'POST',
    path: '/iclock/cdata',
    query: 'SN=SYZ8252500376&table=ATTLOG&Stamp=9999',
    table: 'ATTLOG',
    stamp: '9999',
    contentType: 'text/plain',
    body: '9999\t2026-08-12 08:53:23\t0\t1\n',
    bytes: 29,
    ...overrides,
  }
}

interface Recorded {
  inserts: RawMessageInsert[]
  finishes: Array<{ id: number; patch: RawMessageFinish }>
  advances: StampAdvance[]
  incidents: IncidentInput[]
  optionsUpserts: number
  attlogIngests: number
}

function makeService(
  options: {
    insertThrows?: boolean
    attlogStatus?: 'processed' | 'partial'
    ingestThrows?: boolean
  } = {}
) {
  const recorded: Recorded = {
    inserts: [],
    finishes: [],
    advances: [],
    incidents: [],
    optionsUpserts: 0,
    attlogIngests: 0,
  }
  const rawMessages: RawMessageRepository = {
    async insertReceived(input) {
      if (options.insertThrows) throw new Error('ER_LOCK_WAIT_TIMEOUT: la base no respondio')
      recorded.inserts.push(input)
      return recorded.inserts.length
    },
    async finish(id, patch) {
      recorded.finishes.push({ id, patch })
    },
  }
  const progress: UploadProgressRepository = {
    async stampsFor() {
      return {}
    },
    async advance(input) {
      recorded.advances.push(input)
    },
    async listFor() {
      return []
    },
    async resetAll() {},
  }
  const profiles: DeviceProfileRepository = {
    async ensure() {
      return { accessPointProfileDialect: 'unknown' } as unknown as AccessPointProfile
    },
    async setDialect(_id, _bu, dialect) {
      return dialect
    },
    async setRegistryCode() {},
    async recordIpSeen() {},
    async findByAccessPoint() {
      return null
    },
    async applyOptions() {
      return {} as unknown as AccessPointProfile
    },
    async copyDescriptor() {},
  }
  const incidents = {
    async record(input: IncidentInput): Promise<IncidentOutcome> {
      recorded.incidents.push(input)
      return 'created'
    },
  } as unknown as IncidentService
  const deviceProfiles = {
    async upsertFromOptions() {
      recorded.optionsUpserts += 1
      return { platform: 'ZAM180_TFT', layoutKnown: true, changedFields: [], mismatches: 0 }
    },
  } as unknown as DeviceProfileService
  /**
   * La ingesta de ATTLOG tiene su propia prueba; aqui solo interesa que el
   * canal la invoque y respete su veredicto.
   */
  const attlog = {
    async ingest() {
      recorded.attlogIngests += 1
      if (options.ingestThrows) {
        const error = new Error("Out of range value for column 'assist_verify_method' at row 1")
        ;(error as { code?: string }).code = 'ER_WARN_DATA_OUT_OF_RANGE'
        throw error
      }
      return {
        status: options.attlogStatus ?? 'processed',
        error: null,
        inserted: 1,
        preexisting: 0,
        held: 0,
        unparsed: 0,
      }
    },
  } as unknown as AttlogIngestionService
  const service = new AdmsChannelService(
    rawMessages,
    incidents,
    progress,
    profiles,
    deviceProfiles,
    attlog
  )
  return { service, recorded }
}

/**
 * Invariante central del canal (spec v2, 4.3): el acuse `OK: n` sale SOLO
 * despues de que el cuerpo quedo guardado, y n cuenta las lineas no vacias.
 * Si la persistencia falla, la subida no se acusa y la excepcion sube a la
 * pasarela, que responde 500 para que el equipo reintente sin perder nada.
 */
test.group('ADMS channel service: acuse tras persistir', () => {
  test('el crudo se guarda antes del acuse y n cuenta lineas no vacias', async ({ assert }) => {
    const { service, recorded } = makeService()
    const reply = await service.receiveUpload(
      uploadOf({ body: 'a\n\nb\n\n', table: 'ATTLOG', stamp: '9999' })
    )
    assert.deepEqual(reply, { status: 200, body: 'OK: 2' })
    assert.lengthOf(recorded.inserts, 1)
    assert.equal(recorded.inserts[0].body, 'a\n\nb\n\n')
    assert.equal(recorded.inserts[0].lineCount, 2)
    assert.equal(recorded.finishes[0].patch.ack, 'OK: 2')
    assert.deepEqual(
      recorded.advances.map((row) => [row.table, row.value]),
      [['ATTLOG', '9999']]
    )
  })

  test('un fallo al guardar el crudo no acusa: la excepcion sube y no hay stamp', async ({
    assert,
  }) => {
    const { service, recorded } = makeService({ insertThrows: true })
    await assert.rejects(async () => {
      await service.receiveUpload(uploadOf())
    }, /la base no respondio/)
    assert.lengthOf(recorded.inserts, 0)
    assert.lengthOf(recorded.finishes, 0)
    assert.lengthOf(recorded.advances, 0)
  })

  test('cuerpo vacio se acusa con cero y no mueve el stamp de una tabla conocida', async ({
    assert,
  }) => {
    const { service, recorded } = makeService()
    const reply = await service.receiveUpload(uploadOf({ body: '', bytes: 0 }))
    assert.deepEqual(reply, { status: 200, body: 'OK: 0' })
    assert.equal(recorded.finishes[0].patch.ack, 'OK: 0')
    assert.deepEqual(recorded.advances[0].value, '9999')
  })

  test('tabla desconocida: incidente, crudo sin interpretar y stamp que no avanza', async ({
    assert,
  }) => {
    const { service, recorded } = makeService()
    const reply = await service.receiveUpload(uploadOf({ table: 'FOO', body: 'a\nb\n' }))
    assert.deepEqual(reply, { status: 200, body: 'OK: 2' })
    assert.equal(recorded.finishes[0].patch.status, 'unparsed')
    assert.equal(recorded.incidents[0]?.kind, 'unknown_table')
    assert.lengthOf(recorded.advances, 0)
  })

  test('demasiadas lineas: se acusa para cortar el reintento y el crudo queda para reproceso', async ({
    assert,
  }) => {
    const { service, recorded } = makeService()
    const body = `${'x\n'.repeat(2001)}`
    const reply = await service.receiveUpload(uploadOf({ body, bytes: body.length }))
    assert.equal(reply.status, 200)
    assert.equal(reply.body, 'OK: 2001')
    assert.equal(recorded.finishes[0].patch.status, 'unparsed')
    assert.equal(recorded.finishes[0].patch.ack, 'OK: 2001')
    assert.equal(recorded.incidents[0]?.kind, 'oversize_upload')
    assert.lengthOf(recorded.advances, 0)
  })

  test('una subida parcial si avanza el stamp: lo retenido es recuperable', async ({ assert }) => {
    const { service, recorded } = makeService({ attlogStatus: 'partial' })
    const reply = await service.receiveUpload(uploadOf())
    assert.equal(reply.status, 200)
    assert.equal(recorded.finishes[0].patch.status, 'partial')
    assert.deepEqual(
      recorded.advances.map((row) => row.value),
      ['9999']
    )
  })

  test('la tabla options se interpreta y el crudo queda procesado', async ({ assert }) => {
    const { service, recorded } = makeService()
    const reply = await service.receiveUpload(
      uploadOf({ table: 'options', stamp: null, body: '~Platform=ZAM180_TFT' })
    )
    assert.deepEqual(reply, { status: 200, body: 'OK: 1' })
    assert.equal(recorded.optionsUpserts, 1)
    assert.equal(recorded.finishes[0].patch.status, 'processed')
    assert.lengthOf(recorded.incidents, 0)
  })

  /**
   * `registry`, `push` y `devicecmd` son rutas del protocolo, no tablas de
   * datos. Contarlas como tabla desconocida levantaria un incidente en cada
   * arranque del equipo y en cada acuse de comando, y ese ruido tapa los
   * incidentes que si hay que mirar.
   */
  test('las rutas del protocolo no cuentan como tabla desconocida', async ({ assert }) => {
    for (const table of ['registry', 'push', 'devicecmd']) {
      const { service, recorded } = makeService()
      const reply = await service.receiveUpload(
        uploadOf({ table, stamp: null, body: '~ZKFPVersion=10' })
      )

      assert.equal(reply.status, 200)
      // El crudo se guarda igual: es la copia de lo que mando el equipo.
      assert.lengthOf(recorded.inserts, 1)
      assert.equal(recorded.finishes[0].patch.status, 'received')
      assert.lengthOf(recorded.incidents, 0)
    }
  })

  test('una tabla que de verdad no se conoce si levanta incidente', async ({ assert }) => {
    const { service, recorded } = makeService()
    await service.receiveUpload(uploadOf({ table: 'INVENTADA', stamp: null, body: 'x' }))
    assert.equal(recorded.incidents[0]?.kind, 'unknown_table')
    assert.equal(recorded.finishes[0].patch.status, 'unparsed')
  })

  test('un stamp fuera del patron ya llega en null y no avanza nada', async ({ assert }) => {
    const { service, recorded } = makeService()
    await service.receiveUpload(uploadOf({ stamp: null }))
    assert.lengthOf(recorded.advances, 0)
    assert.isNull(recorded.inserts[0].stamp)
  })

  /**
   * El cuerpo ya esta guardado cuando el proceso revienta. Sin acuse el equipo
   * reintentaria el mismo lote cada pocos segundos insertando otro crudo por
   * vuelta, y `received` no lo recoge ni el reproceso ni la purga.
   */
  test('si el proceso revienta se acusa igual y el crudo queda reprocesable', async ({
    assert,
  }) => {
    const { service, recorded } = makeService({ ingestThrows: true })
    const reply = await service.receiveUpload(uploadOf())

    assert.deepEqual(reply, { status: 200, body: 'OK: 1' })
    assert.equal(recorded.finishes[0].patch.status, 'failed')
    assert.include(recorded.finishes[0].patch.error ?? '', 'ER_WARN_DATA_OUT_OF_RANGE')
    assert.equal(recorded.incidents[0]?.kind, 'persist_error')
  })

  test('un proceso fallido NO avanza el stamp: ese lote se recupera del crudo', async ({
    assert,
  }) => {
    const { service, recorded } = makeService({ ingestThrows: true })
    await service.receiveUpload(uploadOf())
    assert.lengthOf(recorded.advances, 0)
  })

  test('el incidente del fallo no lleva el mensaje de la base, solo su tipo', async ({
    assert,
  }) => {
    // El mensaje de MySQL trae los valores de la fila; el contexto se ve en el BO.
    const { service, recorded } = makeService({ ingestThrows: true })
    await service.receiveUpload(uploadOf())
    const context = recorded.incidents[0]?.context ?? {}
    assert.equal(context.reason, 'Error [ER_WARN_DATA_OUT_OF_RANGE]')
    assert.notInclude(JSON.stringify(context), 'assist_verify_method')
  })
})
