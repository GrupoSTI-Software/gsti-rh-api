import { test } from '@japa/runner'
import { EMPLOYEES_SENSITIVE_WRITE_PERMISSIONS } from '#constants/employees_write_permission_declarations'
import { EMPLOYEES_PERMISSION_CATALOG } from '#constants/employees_permission_catalog'
import { LEGAL_CATEGORIES } from '#constants/sensitive_fields'

test.group('EMPLOYEES_SENSITIVE_WRITE_PERMISSIONS', () => {
  test('declara las cinco categorías con module employees, bypass standard y slug del catálogo', ({
    assert,
  }) => {
    const catalogSlugs = new Set(EMPLOYEES_PERMISSION_CATALOG.map((action) => action.slug))

    assert.deepEqual(
      Object.keys(EMPLOYEES_SENSITIVE_WRITE_PERMISSIONS).sort(),
      [...LEGAL_CATEGORIES].sort()
    )

    const expected: Record<string, string> = {
      identificacion: 'sensitive-identificacion-write',
      contacto: 'sensitive-contacto-write',
      financiero: 'sensitive-financiero-write',
      salud: 'sensitive-salud-write',
      biometrico: 'sensitive-biometrico-write',
    }

    for (const category of LEGAL_CATEGORIES) {
      const declaration = EMPLOYEES_SENSITIVE_WRITE_PERMISSIONS[category]
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
