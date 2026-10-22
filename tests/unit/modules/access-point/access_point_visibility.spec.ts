import { test } from '@japa/runner'
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

test.group('whereVisibleTo', () => {
  const recorder = () => {
    const calls: Array<[string, string, number[]]> = []
    return {
      calls,
      query: {
        whereIn: (column: string, values: number[]) => calls.push(['whereIn', column, values]),
        orWhereIn: (column: string, values: number[]) => calls.push(['orWhereIn', column, values]),
      },
    }
  }

  test('propios y compartidos', ({ assert }) => {
    const { calls, query } = recorder()
    whereVisibleTo(query, [OWNER], [7, 8])
    assert.deepEqual(calls, [
      ['whereIn', 'business_unit_id', [OWNER]],
      ['orWhereIn', 'access_point_id', [7, 8]],
    ])
  })

  test('sin compartidos no agrega el OR', ({ assert }) => {
    const { calls, query } = recorder()
    whereVisibleTo(query, [OWNER, GUEST], [])
    assert.deepEqual(calls, [['whereIn', 'business_unit_id', [OWNER, GUEST]]])
  })
})
