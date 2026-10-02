/**
 * CA5 — catálogo de la demostración (USRH1789328927671).
 * Tres casos, sin base de datos.
 */
import { test } from '@japa/runner'
import {
  DEMO_DEPARTMENTS,
  DEMO_SUPPORT_DEPARTMENT_KEY,
} from '#modules/demo/factories/department_factory'
import {
  DEMO_POSITIONS,
  DEMO_SUPPORT_POSITION_KEY,
} from '#modules/demo/factories/position_factory'

const FILLER = ['Sin Departamento', 'Sin posición']

function hasOwn(row: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(row, key)
}

function mentionsFiller(value: string): boolean {
  return FILLER.some((filler) => value.includes(filler))
}

test.group('CA5 — catálogo demo', () => {
  test('departamentos sin departmentId ni nombres o alias de relleno', ({ assert }) => {
    assert.isAbove(DEMO_DEPARTMENTS.length, 0)
    for (const row of DEMO_DEPARTMENTS) {
      assert.isFalse(hasOwn(row, 'departmentId'))
      assert.isFalse(mentionsFiller(row.name))
      assert.isFalse(mentionsFiller(row.alias))
      assert.isFalse(mentionsFiller(row.key))
    }
  })

  test('puestos sin positionId ni nombres o alias de relleno', ({ assert }) => {
    assert.isAbove(DEMO_POSITIONS.length, 0)
    for (const row of DEMO_POSITIONS) {
      assert.isFalse(hasOwn(row, 'positionId'))
      assert.isFalse(mentionsFiller(row.name))
      assert.isFalse(mentionsFiller(row.alias))
      assert.isFalse(mentionsFiller(row.key))
    }
  })

  test('claves de soporte, parentKey hacia atrás y departmentKey existente', ({ assert }) => {
    const departmentKeys: string[] = []
    for (const row of DEMO_DEPARTMENTS) {
      if (row.parentKey !== null) {
        assert.include(departmentKeys, row.parentKey)
      }
      departmentKeys.push(row.key)
    }
    assert.include(departmentKeys, DEMO_SUPPORT_DEPARTMENT_KEY)

    const positionKeys: string[] = []
    for (const row of DEMO_POSITIONS) {
      if (row.parentKey !== null) {
        assert.include(positionKeys, row.parentKey)
      }
      assert.include(departmentKeys, row.departmentKey)
      positionKeys.push(row.key)
    }

    const supportPosition = DEMO_POSITIONS.find((row) => row.key === DEMO_SUPPORT_POSITION_KEY)
    assert.exists(supportPosition)
    assert.equal(supportPosition!.departmentKey, DEMO_SUPPORT_DEPARTMENT_KEY)
    assert.equal(DEMO_DEPARTMENTS.length, 13)
    assert.equal(DEMO_POSITIONS.length, 25)
  })
})
