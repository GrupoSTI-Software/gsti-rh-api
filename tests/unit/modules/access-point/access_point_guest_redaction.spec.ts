import { test } from '@japa/runner'
import {
  redactCatalogForGuest,
  redactHealthForGuest,
  redactProfileForGuest,
} from '#modules/access-point/sharing/access_point_guest_redaction'
import type { AccessPointSharingView } from '#modules/access-point/sharing/access_point_sharing_view'
import type { AccessPointHealthDto } from '#modules/access-point/health/health.dto'
import type { DeviceProfileDto } from '#modules/access-point/device-profile/dto/device_profile.dto'

/**
 * Lo que no viaja a la invitada, campo por campo (VLRH-H1792107443082, CA-3).
 * Cada forma se compara contra el objeto completo esperado: un campo nuevo en
 * la declaracion o uno que deje de recortarse rompe la prueba.
 */
const GUEST_VIEW: AccessPointSharingView = {
  sharedRole: 'guest',
  sharedWith: [],
  sharedBy: 'Responsable SA',
}
const OWNER_VIEW: AccessPointSharingView = {
  sharedRole: 'owner',
  sharedWith: ['Invitada SA'],
  sharedBy: null,
}

test.group('Recorte de la invitada: catalogo', () => {
  const serialized = () => ({
    accessPointId: 5,
    accessPointName: 'Entrada',
    businessUnitId: 10,
    businessUnit: { businessUnitId: 10, businessUnitName: 'Responsable SA', businessUnitSlug: 'r' },
    accessPointIp: '10.0.0.5',
    accessPointMac: 'AA:BB',
    accessPointAllowedCidrs: ['10.0.0.0/24'],
    accessPointSerialNumber: 'SN1',
  })

  test('la invitada solo recibe el nombre de la responsable y nada de red', ({ assert }) => {
    assert.deepEqual(redactCatalogForGuest(serialized(), GUEST_VIEW), {
      accessPointId: 5,
      accessPointName: 'Entrada',
      businessUnitId: null,
      businessUnit: { businessUnitName: 'Responsable SA' },
      accessPointIp: null,
      accessPointMac: null,
      accessPointAllowedCidrs: null,
      accessPointSerialNumber: 'SN1',
    })
  })

  test('un campo recortado que la consulta no selecciono llega nulo igual', ({ assert }) => {
    const withoutCidrs: Record<string, unknown> = { ...serialized() }
    delete withoutCidrs.accessPointAllowedCidrs
    const redacted = redactCatalogForGuest(withoutCidrs, GUEST_VIEW)
    assert.property(redacted, 'accessPointAllowedCidrs')
    assert.isNull(redacted.accessPointAllowedCidrs)
  })

  test('la responsable y el no compartido reciben el objeto intacto', ({ assert }) => {
    const row = serialized()
    assert.strictEqual(redactCatalogForGuest(row, OWNER_VIEW), row)
    assert.strictEqual(redactCatalogForGuest(row, undefined), row)
  })
})

test.group('Recorte de la invitada: salud', () => {
  const health = (lastFailure: AccessPointHealthDto['queue']['lastFailure']) =>
    ({
      accessPointId: 5,
      name: 'Entrada',
      mac: 'AA:BB',
      ip: '10.0.0.5',
      enrollment: { confirmedEmployees: 3 },
      openIncidents: { actionable: 1, informational: 2 },
      queue: { pending: 1, inFlight: 0, failed: 1, stale: 0, oldestPendingSeconds: 4, lastFailure },
      hardening: {
        cidrRestricted: true,
        lastIpSeen: '10.0.0.5',
        lastIpSeenAt: '2026-10-20T10:00:00.000Z',
        ipAnomalyOpen: false,
      },
    }) as unknown as AccessPointHealthDto

  const failure = {
    kind: 'user_delete',
    returnCode: -1,
    error: 'PIN 12 de Juan',
    failedAt: '2026-10-20T10:00:00.000Z',
  }

  test('sin red, padron, avisos ni texto del ultimo fallo', ({ assert }) => {
    assert.deepEqual(redactHealthForGuest(health(failure)), {
      accessPointId: 5,
      name: 'Entrada',
      mac: null,
      ip: null,
      enrollment: null,
      openIncidents: null,
      queue: {
        pending: 1,
        inFlight: 0,
        failed: 1,
        stale: 0,
        oldestPendingSeconds: 4,
        lastFailure: { ...failure, error: null },
      },
      hardening: {
        cidrRestricted: true,
        lastIpSeen: null,
        lastIpSeenAt: null,
        ipAnomalyOpen: false,
      },
    } as unknown as AccessPointHealthDto)
  })

  test('sin fallo previo, lastFailure se queda null', ({ assert }) => {
    assert.isNull(redactHealthForGuest(health(null)).queue.lastFailure)
  })

  test('no muta el objeto de la responsable', ({ assert }) => {
    const row = health(failure)
    redactHealthForGuest(row)
    assert.equal(row.ip, '10.0.0.5')
    assert.equal(row.queue.lastFailure?.error, 'PIN 12 de Juan')
    assert.equal(row.hardening.lastIpSeen, '10.0.0.5')
  })
})

test.group('Recorte de la invitada: perfil', () => {
  test('sin la ultima IP desde la que reporto el aparato', ({ assert }) => {
    const dto = {
      accessPointId: 5,
      available: true,
      firmware: 'Ver 1',
      lastIpSeen: '10.0.0.5',
      lastIpSeenAt: '2026-10-20T10:00:00.000Z',
    } as unknown as DeviceProfileDto
    assert.deepEqual(redactProfileForGuest(dto), {
      accessPointId: 5,
      available: true,
      firmware: 'Ver 1',
      lastIpSeen: null,
      lastIpSeenAt: null,
    } as unknown as DeviceProfileDto)
    assert.equal(dto.lastIpSeen, '10.0.0.5')
  })
})
