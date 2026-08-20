import { test } from '@japa/runner'
import { EMPLOYEES_SENSITIVE_READ_PERMISSIONS } from '#constants/employees_read_permission_declarations'
import { EMPLOYEES_PERMISSION_CATALOG } from '#constants/employees_permission_catalog'
import { LEGAL_CATEGORIES } from '#constants/sensitive_fields'

test.group('EMPLOYEES_SENSITIVE_READ_PERMISSIONS', () => {
  test('declara las cinco categorías con module employees, bypass standard y slug del catálogo', ({
    assert,
  }) => {
    const catalogSlugs = new Set(EMPLOYEES_PERMISSION_CATALOG.map((action) => action.slug))

    assert.deepEqual(
      Object.keys(EMPLOYEES_SENSITIVE_READ_PERMISSIONS).sort(),
      [...LEGAL_CATEGORIES].sort()
    )

    const expected: Record<string, string> = {
      identificacion: 'sensitive-identificacion-read',
      contacto: 'sensitive-contacto-read',
      financiero: 'sensitive-financiero-read',
      salud: 'sensitive-salud-read',
      biometrico: 'sensitive-biometrico-read',
    }

    for (const category of LEGAL_CATEGORIES) {
      const declaration = EMPLOYEES_SENSITIVE_READ_PERMISSIONS[category]
      assert.equal(declaration.module, 'employees')
      assert.equal(declaration.bypass, 'standard')
      assert.equal(declaration.action, expected[category])
      assert.isTrue(
        catalogSlugs.has(declaration.action as string),
        `slug ausente en catálogo: ${String(declaration.action)}`
      )
    }
  })
})
