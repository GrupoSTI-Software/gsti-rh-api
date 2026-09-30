import { test } from '@japa/runner'
import { createBranchOfficeValidator, updateBranchOfficeValidator } from '#validators/branch_office'

/**
 * Dirección de la sucursal: toda opcional.
 *
 * El domicilio sirve para los documentos del personal asignado, pero no es lo
 * que identifica a la sucursal ni condiciona su operación: una sucursal recién
 * creada, o la "Oficina principal" que siembra el alta de la empresa, pueden
 * vivir sin él y completarlo después.
 *
 * Sin BD: el validador de sucursal no tiene reglas `unique`.
 */

const base = {
  businessUnitId: 1,
  branchOfficeName: 'Planta Norte',
}

test.group('createBranchOfficeValidator — dirección estructurada', () => {
  test('acepta el alta sin nada de domicilio y no inventa las claves', async ({ assert }) => {
    const data = await createBranchOfficeValidator.validate(base)

    assert.isFalse('branchOfficeStreet' in data)
    assert.isFalse('branchOfficeCity' in data)
    assert.isFalse('branchOfficeState' in data)
    assert.isFalse('branchOfficeSettlement' in data)
    assert.isFalse('branchOfficeZipcode' in data)
  })

  test('conserva el domicilio completo cuando viene', async ({ assert }) => {
    const data = await createBranchOfficeValidator.validate({
      ...base,
      branchOfficeStreet: 'Av. Industrial 1420',
      branchOfficeSettlement: 'Parque Industrial Toluca 2000',
      branchOfficeZipcode: '50200',
      branchOfficeCity: 'Toluca',
      branchOfficeState: 'Estado de México',
    })

    assert.equal(data.branchOfficeStreet, 'Av. Industrial 1420')
    assert.equal(data.branchOfficeSettlement, 'Parque Industrial Toluca 2000')
    assert.equal(data.branchOfficeZipcode, '50200')
    assert.equal(data.branchOfficeCity, 'Toluca')
    assert.equal(data.branchOfficeState, 'Estado de México')
  })

  test('acepta un domicilio a medias: solo ciudad y estado', async ({ assert }) => {
    const data = await createBranchOfficeValidator.validate({
      ...base,
      branchOfficeCity: 'Lerma',
      branchOfficeState: 'Estado de México',
    })

    assert.equal(data.branchOfficeCity, 'Lerma')
    assert.isFalse('branchOfficeStreet' in data)
  })
})

test.group('updateBranchOfficeValidator — dirección estructurada', () => {
  test('la edición parcial no inventa las claves de dirección', async ({ assert }) => {
    const data = await updateBranchOfficeValidator.validate({
      branchOfficeName: 'Planta Norte renombrada',
    })

    assert.isFalse('branchOfficeStreet' in data)
    assert.isFalse('branchOfficeCity' in data)
    assert.isFalse('branchOfficeState' in data)
  })

  test('cualquier campo del domicilio se puede limpiar con null', async ({ assert }) => {
    const data = await updateBranchOfficeValidator.validate({
      branchOfficeStreet: null,
      branchOfficeSettlement: null,
      branchOfficeZipcode: null,
      branchOfficeCity: null,
      branchOfficeState: null,
    })

    assert.isNull(data.branchOfficeStreet)
    assert.isNull(data.branchOfficeSettlement)
    assert.isNull(data.branchOfficeZipcode)
    assert.isNull(data.branchOfficeCity)
    assert.isNull(data.branchOfficeState)
  })
})
