import { test } from '@japa/runner'
import {
  EMPLOYEES_PERMISSION_CATALOG,
  validateCatalogIntegrity,
  SYSTEM_PERMISSION_CATALOG,
} from '#constants/system_permission_catalog'

const LEGACY_SLUGS = [
  'create',
  'update',
  'delete',
  'read',
  'read-terminated-employees',
  'update-information',
  'add-exception',
  'manage-shift',
  'manage-vacation',
  'exception-request',
  'manage-shift-change',
  'remove-shift-assigned-to-the-day',
  'read-only-files',
  'manage-files',
  'read-work-disabilities',
  'manage-work-disabilities',
  'manage-responsible-read',
  'manage-responsible-edit',
  'manage-assigned-read',
  'manage-assigned-edit',
  'full-employee-assigned',
  'manage-biotime',
  'show-face-id',
  'upload-face-id',
  'show-fingers',
  'upload-fingers',
  'reveal-sensitive-data',
  'register-physical-consent',
] as const

test.group('EMPLOYEES_PERMISSION_CATALOG granular (USRH1785766406722)', () => {
  test('conserva las 28 decisiones legacy con relation exact', ({ assert }) => {
    for (const slug of LEGACY_SLUGS) {
      const action = EMPLOYEES_PERMISSION_CATALOG.find((a) => a.slug === slug)
      assert.exists(action, slug)
      assert.equal(action!.legacyEquivalence?.systemPermissionSlug, slug)
      assert.equal(action!.legacyEquivalence?.relation, 'exact')
      assert.isUndefined(action!.exemption)
    }
  })

  test('declara read+write(+delete) por pestaña; consentimiento sin delete', ({ assert }) => {
    const tabs = [
      'foto',
      'trabajo',
      'persona',
      'condicion-medica',
      'periodos-lactancia',
      'expediente',
      'domicilio',
      'bancos',
      'responsable',
      'zonas',
      'asignados',
      'biometricos',
      'anotaciones',
      'dispositivos',
      'evaluaciones',
      'assessments',
      'ruta-carrera',
      'certificaciones',
    ]
    for (const tab of tabs) {
      assert.exists(EMPLOYEES_PERMISSION_CATALOG.find((a) => a.slug === `tab-${tab}-read`))
      assert.exists(EMPLOYEES_PERMISSION_CATALOG.find((a) => a.slug === `tab-${tab}-write`))
      assert.exists(EMPLOYEES_PERMISSION_CATALOG.find((a) => a.slug === `tab-${tab}-delete`))
    }
    assert.exists(EMPLOYEES_PERMISSION_CATALOG.find((a) => a.slug === 'tab-consentimiento-read'))
    assert.exists(EMPLOYEES_PERMISSION_CATALOG.find((a) => a.slug === 'tab-consentimiento-write'))
    assert.isUndefined(
      EMPLOYEES_PERMISSION_CATALOG.find((a) => a.slug === 'tab-consentimiento-delete')
    )
  })

  test('tab-expediente-write documenta broader hacia manage-files, no update-information', ({
    assert,
  }) => {
    const action = EMPLOYEES_PERMISSION_CATALOG.find((a) => a.slug === 'tab-expediente-write')
    assert.exists(action)
    assert.equal(action!.legacyEquivalence?.systemPermissionSlug, 'manage-files')
    assert.equal(action!.legacyEquivalence?.relation, 'broader')
  })

  test('declara listado nuevo, descargas, sensibles y excepciones masivas', ({ assert }) => {
    for (const slug of [
      'import-employees',
      'import-shift-assignments',
      'apply-exception-mass',
      'generate-badges',
      'download-employees-list',
      'download-attendance-report',
      'download-vacations-history',
      'download-proceeding-files',
      'sensitive-identificacion-read',
      'sensitive-identificacion-write',
      'sensitive-contacto-read',
      'sensitive-contacto-write',
      'sensitive-financiero-read',
      'sensitive-financiero-write',
      'sensitive-salud-read',
      'sensitive-salud-write',
      'sensitive-biometrico-read',
      'sensitive-biometrico-write',
    ]) {
      assert.exists(
        EMPLOYEES_PERMISSION_CATALOG.find((a) => a.slug === slug),
        slug
      )
    }
  })

  test('aparta la app del colaborador con exemption y owner', ({ assert }) => {
    const exempt = EMPLOYEES_PERMISSION_CATALOG.filter((a) => a.exemption)
    assert.isAtLeast(exempt.length, 6)
    for (const action of exempt) {
      assert.equal(action.section, 'app-colaborador')
      assert.isString(action.exemption!.reason)
      assert.isString(action.exemption!.owner)
    }
  })

  test('sin slugs duplicados y validateCatalogIntegrity pasa', ({ assert }) => {
    const slugs = EMPLOYEES_PERMISSION_CATALOG.map((a) => a.slug)
    assert.equal(new Set(slugs).size, slugs.length)
    assert.doesNotThrow(() => validateCatalogIntegrity(SYSTEM_PERMISSION_CATALOG))
  })

  test('declara manage-employee-supplies en expediente, independiente de manage-files', ({
    assert,
  }) => {
    const action = EMPLOYEES_PERMISSION_CATALOG.find((a) => a.slug === 'manage-employee-supplies')
    assert.exists(action)
    assert.equal(action!.displayName, 'Administrar suministros del colaborador')
    assert.equal(action!.kind, 'write')
    assert.equal(action!.section, 'expediente')
    assert.equal(action!.exceptionProfile, 'standard')
    assert.isUndefined(action!.legacyEquivalence)
    assert.isUndefined(action!.exemption)

    const expedienteWrite = EMPLOYEES_PERMISSION_CATALOG.find((a) => a.slug === 'tab-expediente-write')
    assert.exists(expedienteWrite)
    assert.notEqual(expedienteWrite!.slug, action!.slug)
  })
})
