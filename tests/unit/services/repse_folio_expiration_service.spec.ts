import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import RepseRegistration from '#models/repse_registration'
import RepseFolioExpirationService from '#services/repse_folio_expiration_service'
import { RENEWAL_THRESHOLD_DAYS } from '#constants/repse_folio_aviso'
import { TenantContext } from '#utils/tenant_context'
import { todayInBusinessZone } from '#utils/business_date'

/**
 * USRH1784259105812 — lectura de folios REPSE vencidos/por vencer para la
 * Matriz de Vencimientos. Fail-closed por scope; ventana de renovación 90 días.
 */
test.group('RepseFolioExpirationService — scope del reporte', () => {
  test('sin TenantContext activo devuelve lista vacía (fail-closed)', async ({ assert }) => {
    assert.isFalse(TenantContext.isActive())
    const service = new RepseFolioExpirationService()
    const rows = await service.getExpiredAndExpiring()
    assert.isArray(rows)
    assert.lengthOf(rows, 0)
  })

  test('con TenantContext activo y scope vacío devuelve lista vacía', async ({ assert }) => {
    const rows = await TenantContext.run([], async () => {
      const service = new RepseFolioExpirationService()
      return service.getExpiredAndExpiring()
    })

    assert.isArray(rows)
    assert.lengthOf(rows, 0)
  })
})

test.group('RepseFolioExpirationService — ventana de vencimiento (BD)', (group) => {
  const createdIds: number[] = []
  const suffix = Date.now()
  const today = todayInBusinessZone()

  group.teardown(async () => {
    for (const id of createdIds) {
      await RepseRegistration.query().where('repseRegistrationId', id).delete()
    }
  })

  async function createRegistration(
    businessUnitId: number,
    expiresAt: DateTime,
    status: 'active' = 'active'
  ): Promise<RepseRegistration> {
    const row = new RepseRegistration()
    row.businessUnitId = businessUnitId
    row.folio = `TEST-EXP-${suffix}-${createdIds.length}`
    row.registeredAt = today.minus({ years: 1 })
    row.expiresAt = expiresAt
    row.status = status
    await row.save()
    createdIds.push(row.repseRegistrationId)
    return row
  }

  test('incluye folio vencido con daysToExpire negativo', async ({ assert }) => {
    const registration = await createRegistration(1, today.minus({ days: 10 }))

    const rows = await TenantContext.run([1], async () => {
      return new RepseFolioExpirationService().getExpiredAndExpiring()
    })

    const match = rows.find((r) => r.repseRegistrationId === registration.repseRegistrationId)
    assert.exists(match)
    assert.isBelow(match!.daysToExpire, 0)
  })

  test('incluye folio dentro del umbral de 90 días', async ({ assert }) => {
    const registration = await createRegistration(1, today.plus({ days: 30 }))

    const rows = await TenantContext.run([1], async () => {
      return new RepseFolioExpirationService().getExpiredAndExpiring()
    })

    const match = rows.find((r) => r.repseRegistrationId === registration.repseRegistrationId)
    assert.exists(match)
    assert.isAtLeast(match!.daysToExpire, 0)
    assert.isAtMost(match!.daysToExpire, RENEWAL_THRESHOLD_DAYS)
    assert.property(match!.informativa, 'presentationDate')
    assert.property(match!.informativa, 'daysRemaining')
    assert.match(match!.informativa.presentationDate, /^\d{4}-\d{2}-\d{2}$/)
  })

  test('excluye folio holgado (más de 90 días)', async ({ assert }) => {
    const holgado = await createRegistration(1, today.plus({ days: RENEWAL_THRESHOLD_DAYS + 15 }))

    const rows = await TenantContext.run([1], async () => {
      return new RepseFolioExpirationService().getExpiredAndExpiring()
    })

    const match = rows.find((r) => r.repseRegistrationId === holgado.repseRegistrationId)
    assert.isUndefined(match)
  })

  test('excluye folio de BU fuera del scope', async ({ assert }) => {
    const registration = await createRegistration(1, today.plus({ days: 15 }))

    const rows = await TenantContext.run([2], async () => {
      return new RepseFolioExpirationService().getExpiredAndExpiring()
    })

    const match = rows.find((r) => r.repseRegistrationId === registration.repseRegistrationId)
    assert.isUndefined(match)
  })

  test('excluye registro soft-deleted', async ({ assert }) => {
    const deleted = await createRegistration(1, today.plus({ days: 20 }))
    deleted.deletedAt = DateTime.now()
    await deleted.save()

    const rows = await TenantContext.run([1], async () => {
      return new RepseFolioExpirationService().getExpiredAndExpiring()
    })

    const match = rows.find((r) => r.repseRegistrationId === deleted.repseRegistrationId)
    assert.isUndefined(match)
  })
})
