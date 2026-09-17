import { test } from '@japa/runner'
import { updateEmployeeValidator } from '#validators/employee'

/**
 * USRH1788466831270 — al editar, departamento y puesto no son obligatorios
 * (regla 1). Ausente y `null` pasan; `0` sigue fuera (`min(1)`). Sin BD: el
 * validador de edición no tiene reglas `unique`.
 */
const base = {
  employeeCode: 'EDIT-001',
  companyId: 1,
  employeeTypeId: 1,
}

test.group('updateEmployeeValidator — estructura opcional al editar (USRH1788466831270)', () => {
  test('sin departmentId ni positionId pasa y no inventa las claves', async ({ assert }) => {
    const data = await updateEmployeeValidator.validate(base)

    assert.isFalse('departmentId' in data)
    assert.isFalse('positionId' in data)
  })

  test('null explícito pasa y llega como null (regla 9)', async ({ assert }) => {
    const data = await updateEmployeeValidator.validate({
      ...base,
      departmentId: null,
      positionId: null,
    })

    assert.isNull(data.departmentId)
    assert.isNull(data.positionId)
  })

  test('un id positivo pasa como número', async ({ assert }) => {
    const data = await updateEmployeeValidator.validate({
      ...base,
      departmentId: 7,
      positionId: '12',
    })

    assert.strictEqual(data.departmentId, 7)
    assert.strictEqual(data.positionId, 12)
  })

  test('0 sigue rechazado: no es "sin asignar", es un id inválido', async ({ assert }) => {
    await assert.rejects(() => updateEmployeeValidator.validate({ ...base, departmentId: 0 }))
    await assert.rejects(() => updateEmployeeValidator.validate({ ...base, positionId: 0 }))
  })
})
