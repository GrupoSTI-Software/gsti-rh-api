import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import DeviceClockService, {
  medianOf,
} from '#modules/access-point/device-clock/device_clock.service'
import type {
  ClockState,
  ClockStatePatch,
  DeviceClockRepository,
} from '#modules/access-point/device-clock/device_clock.repository'
import type IncidentService from '#modules/adms/raw/incident.service'
import type { IncidentInput, IncidentOutcome } from '#modules/adms/raw/incident.service'

const NOW = DateTime.fromISO('2026-09-07T12:00:00Z')

function makeService(existing: number[] = []) {
  const written: ClockStatePatch[] = []
  const incidents: IncidentInput[] = []
  const statuses: string[] = []

  const repository: DeviceClockRepository = {
    async read(): Promise<ClockState> {
      return {
        samples: existing,
        offsetSeconds: null,
        measuredAt: null,
        syncedAt: null,
        status: null,
      }
    },
    async write(_id, _bu, patch) {
      written.push(patch)
    },
    async setStatus(_id, _bu, status) {
      statuses.push(status)
    },
  }

  const incidentService = {
    async record(input: IncidentInput): Promise<IncidentOutcome> {
      incidents.push(input)
      return 'created'
    },
  } as unknown as IncidentService

  return {
    service: new DeviceClockService(repository, incidentService),
    written,
    incidents,
    statuses,
  }
}

const BASE = { accessPointId: 12, businessUnitId: 1, serial: 'SYZ8252500376', now: NOW }

test.group('Mediana de la deriva', () => {
  test('impar toma el central; par promedia los dos centrales y redondea', ({ assert }) => {
    assert.equal(medianOf([5, 1, 3]), 3)
    assert.equal(medianOf([1, 2, 3, 4]), 3)
    assert.equal(medianOf([-10, 10]), 0)
    assert.equal(medianOf([7]), 7)
  })

  test('una muestra extrema no mueve la mediana, que es justo el punto', ({ assert }) => {
    // Con promedio, ese 20000 daria mas de 3000 segundos de "deriva".
    assert.equal(medianOf([2, 3, 4, 5, 20000]), 4)
  })
})

test.group('Reloj del checador', () => {
  test('sin deriva se guarda la medicion y no se levanta nada', async ({ assert }) => {
    const { service, written, incidents } = makeService()
    const result = await service.observe({ ...BASE, samples: [2, 3, 4] })

    assert.equal(result.medianSeconds, 3)
    assert.isFalse(result.driftDetected)
    assert.isFalse(result.dstSuspected)
    assert.lengthOf(incidents, 0)
    assert.deepEqual(written[0].samples, [2, 3, 4])
    assert.equal(written[0].offsetSeconds, 3)
    assert.equal(written[0].measuredAt, NOW)
  })

  test('una checada vieja se descarta: no es deriva de reloj', async ({ assert }) => {
    const { service, written } = makeService()
    const result = await service.observe({ ...BASE, samples: [3, 4, 60 * 60 * 8] })

    assert.equal(result.discarded, 1)
    assert.deepEqual(written[0].samples, [3, 4])
    assert.isFalse(result.driftDetected)
  })

  test('un lote entero de checadas viejas no escribe nada', async ({ assert }) => {
    const { service, written, incidents } = makeService()
    const result = await service.observe({ ...BASE, samples: [60 * 60 * 9, -60 * 60 * 10] })

    assert.isNull(result.medianSeconds)
    assert.equal(result.discarded, 2)
    assert.lengthOf(written, 0)
    assert.lengthOf(incidents, 0)
  })

  test('deriva sostenida sobre el umbral levanta el incidente', async ({ assert }) => {
    const { service, incidents } = makeService()
    const result = await service.observe({ ...BASE, samples: [120, 121, 119] })

    assert.isTrue(result.driftDetected)
    assert.equal(incidents[0].kind, 'clock_drift')
    assert.equal(incidents[0].context?.driftSeconds, 120)
  })

  test('justo en el umbral todavia no es deriva', async ({ assert }) => {
    const { service, incidents } = makeService()
    const result = await service.observe({ ...BASE, samples: [60, 60, 60] })
    assert.isFalse(result.driftDetected)
    assert.lengthOf(incidents, 0)
  })

  test('casi una hora exacta se marca como horario de verano, no como reloj corrido', async ({
    assert,
  }) => {
    const { service, incidents } = makeService()
    const result = await service.observe({ ...BASE, samples: [3600, 3595, 3605] })

    assert.isTrue(result.dstSuspected)
    assert.equal(incidents[0].kind, 'clock_dst_suspected')
    // No se levanta ademas el de reloj corrido: ajustar la hora taparia el sintoma.
    assert.lengthOf(incidents, 1)
  })

  test('una hora exacta hacia atras tambien es sospecha de horario', async ({ assert }) => {
    const { service, incidents } = makeService()
    const result = await service.observe({ ...BASE, samples: [-3600, -3598] })
    assert.isTrue(result.dstSuspected)
    assert.equal(incidents[0].kind, 'clock_dst_suspected')
  })

  test('la ventana conserva solo las ultimas veinte muestras', async ({ assert }) => {
    const previas = Array.from({ length: 20 }, (_unused, index) => index)
    const { service, written } = makeService(previas)
    await service.observe({ ...BASE, samples: [100, 101, 102] })

    assert.lengthOf(written[0].samples, 20)
    // Entran las tres nuevas al final y salen las tres mas viejas.
    assert.deepEqual(written[0].samples.slice(-3), [100, 101, 102])
    assert.equal(written[0].samples[0], 3)
  })

  test('la deriva se acumula con lo ya medido, no se recalcula desde cero', async ({ assert }) => {
    const { service, written } = makeService([100, 100, 100, 100])
    const result = await service.observe({ ...BASE, samples: [0] })
    // Una sola checada buena no borra cuatro medidas corridas.
    assert.equal(written[0].samples.length, 5)
    assert.equal(result.medianSeconds, 100)
    assert.isTrue(result.driftDetected)
  })
})
