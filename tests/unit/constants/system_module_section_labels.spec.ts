import { test } from '@japa/runner'
import {
  SYSTEM_MODULE_ACTION_CATALOGS,
  SYSTEM_MODULE_SECTION_LABELS,
  resolveSectionDisplayName,
} from '#constants/system_modules_menu/system_modules.constant'

test.group('Etiquetas de sección del catálogo', () => {
  test('toda sección usada por un catálogo de acciones tiene nombre declarado', ({ assert }) => {
    const sinEtiqueta: string[] = []

    for (const [moduleSlug, actions] of Object.entries(SYSTEM_MODULE_ACTION_CATALOGS)) {
      for (const action of actions) {
        if (resolveSectionDisplayName(moduleSlug, action.section) === null) {
          sinEtiqueta.push(`${moduleSlug}:${action.section}`)
        }
      }
    }

    // Sin nombre, el cliente cae al slug crudo y la matriz de roles muestra
    // cosas como "Salary Ranges" en medio de una pantalla en español.
    assert.deepEqual(
      [...new Set(sinEtiqueta)],
      [],
      'hay secciones en un catálogo de acciones sin nombre en SYSTEM_MODULE_SECTION_LABELS'
    )
  })

  test('no sobra ninguna etiqueta: cada una corresponde a una sección viva', ({ assert }) => {
    const sobrantes: string[] = []

    for (const [moduleSlug, labels] of Object.entries(SYSTEM_MODULE_SECTION_LABELS)) {
      const actions = SYSTEM_MODULE_ACTION_CATALOGS[
        moduleSlug as keyof typeof SYSTEM_MODULE_ACTION_CATALOGS
      ]
      const vivas = new Set<string>(actions.map((action) => action.section))

      for (const sectionSlug of Object.keys(labels)) {
        if (!vivas.has(sectionSlug)) sobrantes.push(`${moduleSlug}:${sectionSlug}`)
      }
    }

    assert.deepEqual(sobrantes, [], 'hay etiquetas de secciones que ya no existen en el catálogo')
  })

  test('resolveSectionDisplayName devuelve null para un módulo o sección desconocidos', ({
    assert,
  }) => {
    assert.isNull(resolveSectionDisplayName('modulo-que-no-existe', 'listado'))
    assert.isNull(resolveSectionDisplayName('employees', 'seccion-que-no-existe'))
  })

  test('los nombres son legibles: sin slugs crudos ni cadenas vacías', ({ assert }) => {
    for (const [moduleSlug, labels] of Object.entries(SYSTEM_MODULE_SECTION_LABELS)) {
      for (const [sectionSlug, displayName] of Object.entries(labels)) {
        assert.isNotEmpty(displayName, `${moduleSlug}:${sectionSlug} tiene nombre vacío`)
        assert.notInclude(
          displayName,
          '-',
          `${moduleSlug}:${sectionSlug} parece el slug sin traducir`
        )
      }
    }
  })
})
