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
      'import-vacations',
      'apply-exception-mass',
      'generate-badges',
      'download-employees-list',
      'download-attendance-report',
      'download-vacations-history',
      'download-proceeding-files',
      'download-employees-import-template',
      'download-shift-assignment-template',
      'download-shift-exceptions',
      'download-vacations-report',
      'download-vacations-summary',
      'download-vacation-import-template',
      'download-payroll-format',
      'download-attendance-by-employee',
      'download-attendance-by-position',
      'download-attendance-by-department',
      'download-attendance-all',
      'download-permissions-by-dates',
      'download-supplies-report',
      'download-employee-contract',
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

  test('las 15 acciones nuevas de descarga/importación nacen sin herencia ni exemption', ({
    assert,
  }) => {
    const expected: Array<{
      slug: string
      displayName: string
      kind: 'read' | 'write'
      section: string
    }> = [
      {
        slug: 'download-employees-import-template',
        displayName: 'Descargar plantilla de importación de personal',
        kind: 'read',
        section: 'descargas',
      },
      {
        slug: 'download-shift-assignment-template',
        displayName: 'Descargar plantilla de importación de turnos',
        kind: 'read',
        section: 'descargas',
      },
      {
        slug: 'download-shift-exceptions',
        displayName: 'Descargar excepciones de turno',
        kind: 'read',
        section: 'descargas',
      },
      {
        slug: 'download-vacations-report',
        displayName: 'Descargar reporte de vacaciones',
        kind: 'read',
        section: 'descargas',
      },
      {
        slug: 'download-vacations-summary',
        displayName: 'Descargar resumen de vacaciones',
        kind: 'read',
        section: 'descargas',
      },
      {
        slug: 'download-vacation-import-template',
        displayName: 'Descargar plantilla de importación de vacaciones',
        kind: 'read',
        section: 'descargas',
      },
      {
        slug: 'download-payroll-format',
        displayName: 'Descargar formato de nómina',
        kind: 'read',
        section: 'descargas',
      },
      {
        slug: 'download-attendance-by-employee',
        displayName: 'Descargar asistencia por colaborador',
        kind: 'read',
        section: 'descargas',
      },
      {
        slug: 'download-attendance-by-position',
        displayName: 'Descargar asistencia por puesto',
        kind: 'read',
        section: 'descargas',
      },
      {
        slug: 'download-attendance-by-department',
        displayName: 'Descargar asistencia por departamento',
        kind: 'read',
        section: 'descargas',
      },
      {
        slug: 'download-attendance-all',
        displayName: 'Descargar asistencia general',
        kind: 'read',
        section: 'descargas',
      },
      {
        slug: 'download-permissions-by-dates',
        displayName: 'Descargar reporte de permisos por fechas',
        kind: 'read',
        section: 'descargas',
      },
      {
        slug: 'download-supplies-report',
        displayName: 'Descargar reporte de suministros',
        kind: 'read',
        section: 'descargas',
      },
      {
        slug: 'download-employee-contract',
        displayName: 'Descargar contrato',
        kind: 'read',
        section: 'descargas',
      },
      {
        slug: 'import-vacations',
        displayName: 'Importar vacaciones',
        kind: 'write',
        section: 'listado',
      },
    ]

    for (const row of expected) {
      const action = EMPLOYEES_PERMISSION_CATALOG.find((a) => a.slug === row.slug)
      assert.exists(action, row.slug)
      assert.equal(action!.displayName, row.displayName)
      assert.equal(action!.kind, row.kind)
      assert.equal(action!.section, row.section)
      assert.equal(action!.exceptionProfile, 'standard')
      assert.isUndefined(action!.exemption)
      if (row.slug === 'import-vacations') {
        assert.equal(action!.legacyEquivalence?.systemPermissionSlug, 'manage-vacation')
        assert.equal(action!.legacyEquivalence?.relation, 'broader')
      } else {
        assert.isUndefined(action!.legacyEquivalence)
      }
    }

    const existingDownloads = [
      'download-employees-list',
      'download-attendance-report',
      'download-vacations-history',
      'download-proceeding-files',
    ]
    for (const slug of existingDownloads) {
      const action = EMPLOYEES_PERMISSION_CATALOG.find((a) => a.slug === slug)
      assert.exists(action, slug)
      assert.equal(action!.section, 'descargas')
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
