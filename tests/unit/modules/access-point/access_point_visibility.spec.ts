import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import {
  accessPointRoleOf,
  ownsAccessPoint,
  whereVisibleTo,
} from '#modules/access-point/sharing/access_point_visibility'

/**
 * Regla de visibilidad del checador compartido, sin BD (VLRH-H1792107443082, CA-1).
 *
 * Responsable 10; invitada viva 20; ex-invitada con personal en el aparato 30,
 * que solo aparece en el scope del canal (`includeLingering`); ajena 40.
 */
const OWNER = 10
const GUEST = 20
const LINGERING = 30
const OUTSIDER = 40
const PARTICIPANTS = [OWNER, GUEST]
const CHANNEL = [OWNER, GUEST, LINGERING]

test.group('accessPointRoleOf', () => {
  const cases: Array<[string, number[], number[], 'owner' | 'guest' | null]> = [
    ['la responsable en el alcance es owner', PARTICIPANTS, [OWNER], 'owner'],
    [
      'la responsable gana aunque tambien venga una invitada',
      PARTICIPANTS,
      [GUEST, OWNER],
      'owner',
    ],
    ['la invitada viva es guest', PARTICIPANTS, [GUEST], 'guest'],
    ['la invitada revocada sin includeLingering no lo ve', PARTICIPANTS, [LINGERING], null],
    ['la ex-invitada con personal y includeLingering es guest', CHANNEL, [LINGERING], 'guest'],
    ['la empresa ajena no lo ve', CHANNEL, [OUTSIDER], null],
    ['el alcance vacio no ve nada (falla cerrado)', CHANNEL, [], null],
  ]
  for (const [title, deviceScope, requestScope, expected] of cases) {
    test(title, ({ assert }) => {
      assert.strictEqual(accessPointRoleOf(OWNER, deviceScope, requestScope), expected)
    })
  }

  test('ownsAccessPoint solo reconoce a la responsable', ({ assert }) => {
    assert.isTrue(ownsAccessPoint(OWNER, [GUEST, OWNER]))
    assert.isFalse(ownsAccessPoint(OWNER, [GUEST]))
    assert.isFalse(ownsAccessPoint(OWNER, []))
  })
})

/**
 * SQL que arma el builder de Lucid, sin ejecutarlo: el `OR` queda en su propio
 * grupo aunque el llamador encadene otro filtro despues (W4 de la r1).
 */
test.group('whereVisibleTo', () => {
  const sqlOf = (ownedScope: number[], sharedIds: number[]) =>
    whereVisibleTo(db.from('access_points'), ownedScope, sharedIds)
      .whereNull('access_point_deleted_at')
      .toQuery()

  test('propios y compartidos, con el OR agrupado', ({ assert }) => {
    assert.equal(
      sqlOf([OWNER], [7, 8]),
      'select * from `access_points` where (`business_unit_id` in (10) or `access_point_id` in (7, 8)) and `access_point_deleted_at` is null'
    )
  })

  test('sin compartidos no agrega el OR', ({ assert }) => {
    assert.equal(
      sqlOf([OWNER, GUEST], []),
      'select * from `access_points` where (`business_unit_id` in (10, 20)) and `access_point_deleted_at` is null'
    )
  })
})
