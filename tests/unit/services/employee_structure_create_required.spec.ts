import { test } from '@japa/runner'
import {
  isMissingStructureId,
  requireEmployeeStructureForCreate,
} from '#services/employee_structure_service'

/**
 * USRH1789328927556 — al dar de alta, departamento y puesto son obligatorios
 * (regla 1). Vacío o en cero cuenta como faltante (regla 2). Sin BD.
 */
test.group('Estructura del empleado — obligatoriedad al alta (USRH1789328927556)', () => {
  test('regla 2: null, undefined, cadena vacía, 0 y "0" cuentan como faltante', ({ assert }) => {
    assert.isTrue(isMissingStructureId(null))
    assert.isTrue(isMissingStructureId(undefined))
    assert.isTrue(isMissingStructureId(''))
    assert.isTrue(isMissingStructureId('   '))
    assert.isTrue(isMissingStructureId(0))
    assert.isTrue(isMissingStructureId('0'))
  })

  test('un id positivo no es faltante', ({ assert }) => {
    assert.isFalse(isMissingStructureId(1))
    assert.isFalse(isMissingStructureId('12'))
  })

  test('regla 1: faltan los dos → missing both', ({ assert }) => {
    assert.deepEqual(requireEmployeeStructureForCreate({ departmentId: null, positionId: 0 }), {
      ok: false,
      missing: 'both',
    })
    assert.deepEqual(requireEmployeeStructureForCreate({}), {
      ok: false,
      missing: 'both',
    })
  })

  test('regla 1: falta solo el departamento', ({ assert }) => {
    assert.deepEqual(
      requireEmployeeStructureForCreate({ departmentId: '', positionId: 7 }),
      { ok: false, missing: 'department' }
    )
  })

  test('regla 1: falta solo el puesto', ({ assert }) => {
    assert.deepEqual(
      requireEmployeeStructureForCreate({ departmentId: 3, positionId: '0' }),
      { ok: false, missing: 'position' }
    )
  })

  test('los dos presentes pasan', ({ assert }) => {
    assert.deepEqual(
      requireEmployeeStructureForCreate({ departmentId: 3, positionId: '4' }),
      { ok: true }
    )
  })
})
