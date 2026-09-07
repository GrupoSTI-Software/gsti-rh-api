import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import AdmsDeviceResolverService from '#modules/adms/channel/adms_device_resolver.service'
import type {
  AccessPointLookupPort,
  AccessPointLookupRow,
  UnknownSerialThrottle,
} from '#modules/adms/channel/access_point_lookup'
import type { IncidentInput, IncidentOutcome } from '#modules/adms/raw/incident.service'
import type QuarantineService from '#modules/access-point/quarantine/quarantine.service'
import type IncidentService from '#modules/adms/raw/incident.service'
import type { DeviceProfileRepository } from '#modules/access-point/device-profile/device_profile.repository'
import type AccessPointProfile from '#models/access_point_profile'

const NOW = DateTime.fromISO('2026-09-07T12:00:00Z')

function makeDeps(row: AccessPointLookupRow | null, blocked = false, freshProfile = false) {
  const incidents: IncidentInput[] = []
  const hits: string[] = []
  const claims: string[] = []
  const touches: string[] = []
  const sightings: string[] = []
  const lookup: AccessPointLookupPort = {
    async findBySerial() {
      return row
    },
    async touchConnection(_id, ip) {
      touches.push(ip)
    },
  }
  const throttle: UnknownSerialThrottle = {
    async isBlocked() {
      return blocked
    },
    async countNewSerial() {
      return 'ok'
    },
  }
  const incidentService = {
    async record(input: IncidentInput): Promise<IncidentOutcome> {
      incidents.push(input)
      return 'created'
    },
  } as unknown as IncidentService
  const quarantine = {
    async recordHit(input: { serial: string }) {
      hits.push(input.serial)
      return 'created' as const
    },
    async claimOnContact(serial: string) {
      claims.push(serial)
      return true
    },
  } as unknown as QuarantineService
  const profile = {
    async ensure() {
      /** Un perfil recien insertado por Lucid no trae las columnas nullable no asignadas. */
      if (freshProfile) return { async save() {} } as unknown as AccessPointProfile
      return {
        accessPointProfileLastIpSeen: '10.0.0.1',
        accessPointProfileLastIpSeenAt: NOW.minus({ seconds: 30 }),
        async save() {},
      } as unknown as AccessPointProfile
    },
    async setDialect(_id: number, _bu: number, dialect: 'ta' | 'ca' | 'unknown') {
      return dialect
    },
    async setRegistryCode() {},
    async recordIpSeen(_id: number, _bu: number, sighting: { ip: string }) {
      sightings.push(sighting.ip)
    },
  } as unknown as DeviceProfileRepository
  const service = new AdmsDeviceResolverService(
    lookup,
    throttle,
    incidentService,
    quarantine,
    profile
  )
  return { service, incidents, hits, claims, touches, sightings }
}

const ROW: AccessPointLookupRow = {
  accessPointId: 12,
  businessUnitId: 1,
  serial: 'SYZ8252500376',
  active: true,
  allowedCidrs: null,
  timezone: null,
  lastConnectionAt: null,
}

test.group('ADMS device resolver', () => {
  test('serie invalida: OK pelon sin tocar cuarentena', async ({ assert }) => {
    const { service, hits } = makeDeps(null)
    const result = await service.resolve({ serial: 'A B', ip: '1.1.1.1', now: NOW, hints: null })
    assert.deepEqual(result, { kind: 'reject', status: 200, body: 'OK' })
    assert.lengthOf(hits, 0)
  })

  test('serie desconocida: cuarentena y OK pelon', async ({ assert }) => {
    const { service, hits } = makeDeps(null)
    const result = await service.resolve({
      serial: 'NYU7253300829',
      ip: '1.1.1.1',
      now: NOW,
      hints: null,
    })
    assert.deepEqual(result, { kind: 'reject', status: 200, body: 'OK' })
    assert.deepEqual(hits, ['NYU7253300829'])
  })

  test('IP bloqueada por sondeo: 429 texto', async ({ assert }) => {
    const { service } = makeDeps(null, true)
    const result = await service.resolve({
      serial: 'NYU7253300829',
      ip: '1.1.1.1',
      now: NOW,
      hints: null,
    })
    assert.equal(result.kind, 'reject')
    if (result.kind === 'reject') assert.equal(result.status, 429)
  })

  test('equipo inactivo: OK pelon e incidente', async ({ assert }) => {
    const { service, incidents } = makeDeps({ ...ROW, active: false })
    const result = await service.resolve({ serial: ROW.serial, ip: '1.1.1.1', now: NOW, hints: null })
    assert.deepEqual(result, { kind: 'reject', status: 200, body: 'OK' })
    assert.equal(incidents[0]?.kind, 'device_inactive')
  })

  test('IP fuera de los CIDR configurados: OK pelon e incidente ip_denied', async ({ assert }) => {
    const { service, incidents } = makeDeps({ ...ROW, allowedCidrs: ['10.0.0.0/8'] })
    const result = await service.resolve({
      serial: ROW.serial,
      ip: '192.168.1.5',
      now: NOW,
      hints: null,
    })
    assert.deepEqual(result, { kind: 'reject', status: 200, body: 'OK' })
    assert.equal(incidents[0]?.kind, 'ip_denied')
  })

  test('una lista de CIDR configurada pero vacia no autoriza a nadie', async ({ assert }) => {
    const { service, incidents } = makeDeps({ ...ROW, allowedCidrs: [] })
    const result = await service.resolve({
      serial: ROW.serial,
      ip: '10.0.0.1',
      now: NOW,
      hints: null,
    })
    assert.deepEqual(result, { kind: 'reject', status: 200, body: 'OK' })
    assert.equal(incidents[0]?.kind, 'ip_denied')
  })

  test('equipo activo resuelve y el toque registra latido, reclamo y anomalia de IP', async ({
    assert,
  }) => {
    const { service, incidents, claims, touches, sightings } = makeDeps(ROW)
    const result = await service.resolve({
      serial: ROW.serial,
      ip: '192.168.1.5',
      now: NOW,
      hints: null,
    })
    assert.equal(result.kind, 'ok')
    if (result.kind !== 'ok') return
    assert.equal(result.device.businessUnitId, 1)
    await service.touch(result.device)
    assert.deepEqual(touches, ['192.168.1.5'])
    assert.deepEqual(claims, [ROW.serial])
    assert.equal(incidents[0]?.kind, 'ip_anomaly')
    assert.equal(incidents[0]?.context?.previousIp, '10.0.0.1')
    // La ultima IP la escribe el adaptador, no el servicio.
    assert.deepEqual(sightings, ['192.168.1.5'])
  })

  test('primer contacto con perfil recien creado no genera anomalia ni explota', async ({
    assert,
  }) => {
    const { service, incidents, touches } = makeDeps(ROW, false, true)
    const result = await service.resolve({
      serial: ROW.serial,
      ip: '192.168.1.5',
      now: NOW,
      hints: null,
    })
    assert.equal(result.kind, 'ok')
    if (result.kind !== 'ok') return
    await service.touch(result.device)
    assert.deepEqual(touches, ['192.168.1.5'])
    assert.lengthOf(incidents, 0)
  })
})
