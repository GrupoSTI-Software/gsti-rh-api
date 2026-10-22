import { test } from '@japa/runner'
import {
  evaluateEmployeePositionDepartment,
  resolveEmployeePositionDepartmentCheck,
  resolveEmployeeStructureUpdate,
} from '#services/employee_structure_service'

/**
 * USRH1788466831270 — qué departamento y puesto quedan tras la edición y
 * cuáles hay que verificar. Se compara contra lo GUARDADO, nunca contra lo
 * que mande la pantalla (regla 4). Sin BD.
 */
const guardado = { departmentId: 10, positionId: 20, businessUnitId: 5 }
const sinEstructura = { departmentId: null, positionId: null, businessUnitId: 5 }

test.group('Estructura del empleado — resolución al editar (USRH1788466831270)', () => {
  test('regla 2: clave ausente conserva lo guardado y no verifica nada', ({ assert }) => {
    const resolution = resolveEmployeeStructureUpdate(guardado, { businessUnitId: 5 })

    assert.deepEqual(resolution, {
      departmentId: 10,
      positionId: 20,
      businessUnitId: 5,
      departmentIdToVerify: null,
      positionIdToVerify: null,
    })
  })

  test('regla 2: clave ausente conserva también los vacíos, sin inventar nada', ({ assert }) => {
    const resolution = resolveEmployeeStructureUpdate(sinEstructura, { businessUnitId: 5 })

    assert.isNull(resolution.departmentId)
    assert.isNull(resolution.positionId)
    assert.isNull(resolution.departmentIdToVerify)
    assert.isNull(resolution.positionIdToVerify)
  })

  test('regla 4: reenviar el mismo id no verifica, aunque apunte a un departamento eliminado', ({
    assert,
  }) => {
    const resolution = resolveEmployeeStructureUpdate(guardado, {
      departmentId: 10,
      positionId: 20,
      businessUnitId: 5,
    })

    assert.equal(resolution.departmentId, 10)
    assert.equal(resolution.positionId, 20)
    assert.isNull(resolution.departmentIdToVerify)
    assert.isNull(resolution.positionIdToVerify)
  })

  test('regla 3: un id distinto del guardado se verifica contra la empresa del empleado', ({
    assert,
  }) => {
    const resolution = resolveEmployeeStructureUpdate(sinEstructura, {
      departmentId: 11,
      positionId: 21,
      businessUnitId: 5,
    })

    assert.deepEqual(resolution, {
      departmentId: 11,
      positionId: 21,
      businessUnitId: 5,
      departmentIdToVerify: 11,
      positionIdToVerify: 21,
    })
  })

  test('solo se verifica el campo que cambió', ({ assert }) => {
    const resolution = resolveEmployeeStructureUpdate(guardado, {
      departmentId: 10,
      positionId: 21,
      businessUnitId: 5,
    })

    assert.isNull(resolution.departmentIdToVerify)
    assert.equal(resolution.positionIdToVerify, 21)
  })

  test('regla 9: null explícito deja sin asignar y no verifica nada', ({ assert }) => {
    const resolution = resolveEmployeeStructureUpdate(guardado, {
      departmentId: null,
      positionId: null,
      businessUnitId: 5,
    })

    assert.isNull(resolution.departmentId)
    assert.isNull(resolution.positionId)
    assert.isNull(resolution.departmentIdToVerify)
    assert.isNull(resolution.positionIdToVerify)
  })

  test('regla 5: al cambiar de empresa se verifican ambos contra la nueva aunque no cambien', ({
    assert,
  }) => {
    const resolution = resolveEmployeeStructureUpdate(guardado, { businessUnitId: 6 })

    assert.deepEqual(resolution, {
      departmentId: 10,
      positionId: 20,
      businessUnitId: 6,
      departmentIdToVerify: 10,
      positionIdToVerify: 20,
    })
  })

  test('regla 5: al cambiar de empresa, lo vacío sigue vacío y no se verifica', ({ assert }) => {
    const resolution = resolveEmployeeStructureUpdate(sinEstructura, { businessUnitId: 6 })

    assert.isNull(resolution.departmentIdToVerify)
    assert.isNull(resolution.positionIdToVerify)
    assert.equal(resolution.businessUnitId, 6)
  })
})

test.group('Coherencia puesto-departamento — decisión pura (VLRH-H1792361820794)', () => {
  const descuadrado = { departmentId: 1, positionId: 2, businessUnitId: 5 }

  test('empleado descuadrado sin cambio no se verifica', ({ assert }) => {
    const pair = resolveEmployeePositionDepartmentCheck(descuadrado, {
      departmentId: 1,
      positionId: 2,
      businessUnitId: 5,
    })

    assert.isNull(pair)
  })

  test('alta con puesto arma el par; puesto vacío no', ({ assert }) => {
    const withPosition = resolveEmployeePositionDepartmentCheck(null, {
      departmentId: 1,
      positionId: 2,
      businessUnitId: 5,
    })
    const withoutPosition = resolveEmployeePositionDepartmentCheck(null, {
      departmentId: 1,
      positionId: null,
      businessUnitId: 5,
    })

    assert.deepEqual(withPosition, { departmentId: 1, positionId: 2, businessUnitId: 5 })
    assert.isNull(withoutPosition)
  })

  test('(NULL, NULL) hacia (NULL, P1) produce par con departamento null', ({ assert }) => {
    const pair = resolveEmployeePositionDepartmentCheck(
      { departmentId: null, positionId: null, businessUnitId: 5 },
      { departmentId: null, positionId: 1, businessUnitId: 5 }
    )

    assert.deepEqual(pair, { departmentId: null, positionId: 1, businessUnitId: 5 })
  })

  test('cambiar de empresa revisa el par aunque departamento y puesto no cambien', ({ assert }) => {
    const pair = resolveEmployeePositionDepartmentCheck(descuadrado, {
      departmentId: 1,
      positionId: 2,
      businessUnitId: 6,
    })

    assert.deepEqual(pair, { departmentId: 1, positionId: 2, businessUnitId: 6 })
  })

  test('vínculos [D1, D2] con D2 quedan bien; D3 es desajuste', ({ assert }) => {
    const pair = { departmentId: 2, positionId: 9, businessUnitId: 5 }
    const links = [1, 2]

    assert.deepEqual(evaluateEmployeePositionDepartment(pair, links), { ok: true })
    assert.deepEqual(evaluateEmployeePositionDepartment({ ...pair, departmentId: 3 }, links), {
      ok: false,
      reason: 'position-department-mismatch',
      linkedDepartmentIds: [1, 2],
    })
  })

  test('sin departamento o sin vínculos no pasa', ({ assert }) => {
    const pair = { departmentId: null, positionId: 9, businessUnitId: 5 }

    assert.deepEqual(evaluateEmployeePositionDepartment(pair, [1]), {
      ok: false,
      reason: 'position-requires-department',
    })
    assert.deepEqual(evaluateEmployeePositionDepartment({ ...pair, departmentId: 1 }, []), {
      ok: false,
      reason: 'position-without-department-link',
    })
  })
})
