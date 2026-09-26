import { test } from '@japa/runner'
import { EMPLOYEES_PERMISSION_CATALOG } from '#constants/employees_permission_catalog'
import { validateCatalogIntegrity, SYSTEM_PERMISSION_CATALOG } from '#constants/system_permission_catalog'

test.group('EMPLOYEES_PERMISSION_CATALOG — exceptionProfile (USRH1785766406723)', () => {
  test('todas las acciones declaran exceptionProfile', ({ assert }) => {
    for (const action of EMPLOYEES_PERMISSION_CATALOG) {
      assert.property(action, 'exceptionProfile')
      assert.isString(action.exceptionProfile)
    }
  })

  test('todas las acciones del catálogo nacen como standard', ({ assert }) => {
    assert.isAtLeast(EMPLOYEES_PERMISSION_CATALOG.length, 28)
    for (const action of EMPLOYEES_PERMISSION_CATALOG) {
      assert.equal(action.exceptionProfile, 'standard')
    }
  })

  test('validateCatalogIntegrity sigue pasando con el campo nuevo', ({ assert }) => {
    assert.doesNotThrow(() => validateCatalogIntegrity(SYSTEM_PERMISSION_CATALOG))
  })
})
