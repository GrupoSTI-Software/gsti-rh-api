import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import {
  isDayWithinRoleManagementScope,
  isWithinRoleManagementScope,
  resolveRoleManagementFloor,
} from '#modules/role-scope/role_management_scope'

const zone = 'America/Mexico_City'
// 2026-09-22 10:30 hora de Ciudad de México.
const now = DateTime.fromISO('2026-09-22T16:30:00.000Z')

test.group('role-scope — días que un rol alcanza a modificar', () => {
  test('el rol raíz y el rol sin días declarados no tienen tope', ({ assert }) => {
    assert.isNull(resolveRoleManagementFloor({ role: { roleSlug: 'root' }, now, zone }))
    assert.isNull(
      resolveRoleManagementFloor({
        role: { roleSlug: 'root', roleManagementDays: 3 },
        now,
        zone,
      })
    )
    assert.isNull(
      resolveRoleManagementFloor({ role: { roleSlug: 'admin', roleManagementDays: null }, now, zone })
    )
    assert.isNull(resolveRoleManagementFloor({ role: null, now, zone }))
  })

  test('el piso son días completos desde el inicio del día en la zona del sitio', ({ assert }) => {
    const floor = resolveRoleManagementFloor({
      role: { roleSlug: 'admin', roleManagementDays: 3 },
      now,
      zone,
    })

    // 2026-09-19 00:00 en Ciudad de México, que en UTC es el mismo día a las 06:00.
    assert.equal(floor?.toISO(), '2026-09-19T06:00:00.000Z')
  })

  test('cero días deja solo el día en curso', ({ assert }) => {
    const floor = resolveRoleManagementFloor({
      role: { roleSlug: 'admin', roleManagementDays: 0 },
      now,
      zone,
    })

    assert.equal(floor?.toISO(), '2026-09-22T06:00:00.000Z')
  })

  test('la zona del sitio mueve el piso: Tijuana empieza el día una hora después', ({ assert }) => {
    const floor = resolveRoleManagementFloor({
      role: { roleSlug: 'admin', roleManagementDays: 1 },
      now,
      zone: 'America/Tijuana',
    })

    // En septiembre Tijuana va en horario de verano (UTC-7).
    assert.equal(floor?.toISO(), '2026-09-21T07:00:00.000Z')
  })

  test('el instante exacto del piso entra y un segundo antes no', ({ assert }) => {
    const floor = resolveRoleManagementFloor({
      role: { roleSlug: 'admin', roleManagementDays: 3 },
      now,
      zone,
    })

    assert.isTrue(isWithinRoleManagementScope(DateTime.fromISO('2026-09-19T06:00:00.000Z'), floor))
    assert.isFalse(isWithinRoleManagementScope(DateTime.fromISO('2026-09-19T05:59:59.000Z'), floor))
  })

  test('sin piso todo pasa, por vieja que sea la fecha', ({ assert }) => {
    assert.isTrue(isWithinRoleManagementScope(DateTime.fromISO('2019-01-01T00:00:00.000Z'), null))
  })
})

test.group('role-scope — alcance por fecha civil', () => {
  test('un día anterior al piso queda fuera y el del piso entra', ({ assert }) => {
    const floor = resolveRoleManagementFloor({
      role: { roleSlug: 'admin', roleManagementDays: 3 },
      now,
      zone,
    })

    assert.isTrue(isDayWithinRoleManagementScope('2026-09-19', floor, zone))
    assert.isFalse(isDayWithinRoleManagementScope('2026-09-18', floor, zone))
  })

  test('el día se ancla en la zona del sitio, no en UTC', ({ assert }) => {
    const floor = resolveRoleManagementFloor({
      role: { roleSlug: 'admin', roleManagementDays: 1 },
      now,
      zone: 'America/Tijuana',
    })

    // En Tijuana el 21 empieza a las 07:00 UTC, después del piso.
    assert.isTrue(isDayWithinRoleManagementScope('2026-09-21', floor, 'America/Tijuana'))
    assert.isFalse(isDayWithinRoleManagementScope('2026-09-20', floor, 'America/Tijuana'))
  })

  test('sin piso cualquier fecha pasa, y una fecha ilegible no bloquea', ({ assert }) => {
    assert.isTrue(isDayWithinRoleManagementScope('2019-01-01', null, zone))
    assert.isTrue(
      isDayWithinRoleManagementScope('no-es-una-fecha', DateTime.fromISO('2026-09-19'), zone)
    )
  })
})
