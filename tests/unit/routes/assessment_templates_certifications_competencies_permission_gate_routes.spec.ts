import { test } from '@japa/runner'
import { SYSTEM_MODULES } from '#constants/system_modules_menu/system_modules.constant'
import { ASSESSMENT_TEMPLATES_PERMISSION_DECLARATIONS } from '#constants/assessment_templates_permission_declarations'
import { CERTIFICATIONS_PERMISSION_DECLARATIONS } from '#constants/certifications_permission_declarations'
import { COMPETENCIES_PERMISSION_DECLARATIONS } from '#constants/competencies_permission_declarations'
import {
  assertRouteGated,
  assertRouteOpen,
  compactSource,
  gateExpression,
  readSource,
} from '#tests/helpers/route_gate_assertions'

/**
 * Protección vigente en el API de Parámetros de evaluación, Catálogo de
 * certificaciones y Competencias: qué ruta declara `permissionGate`, con qué
 * declaración, y cuál queda abierta a propósito.
 *
 * Las abiertas las consume otra pantalla: el formulario de assessments y la
 * evaluación de competencias del empleado, la Matriz de competencias y el
 * perfil del puesto del Organigrama. Si alguien les pone gate, esas pantallas
 * responden 403 a roles que no administran el módulo.
 */

const TEMPLATES = 'ASSESSMENT_TEMPLATES_PERMISSION_DECLARATIONS'
const CERTIFICATIONS = 'CERTIFICATIONS_PERMISSION_DECLARATIONS'
const COMPETENCIES = 'COMPETENCIES_PERMISSION_DECLARATIONS'

const templatesGate = (key: keyof typeof ASSESSMENT_TEMPLATES_PERMISSION_DECLARATIONS) =>
  gateExpression(TEMPLATES, ASSESSMENT_TEMPLATES_PERMISSION_DECLARATIONS, key)
const certificationsGate = (key: keyof typeof CERTIFICATIONS_PERMISSION_DECLARATIONS) =>
  gateExpression(CERTIFICATIONS, CERTIFICATIONS_PERMISSION_DECLARATIONS, key)
const competenciesGate = (key: keyof typeof COMPETENCIES_PERMISSION_DECLARATIONS) =>
  gateExpression(COMPETENCIES, COMPETENCIES_PERMISSION_DECLARATIONS, key)

test.group('Plantillas, certificaciones y competencias — declaraciones del gate', () => {
  test('assessment-templates: dimensiones, reorden y perfiles por puesto piden update; bypass standard', ({
    assert,
  }) => {
    const standard = (action: string) => ({ module: 'assessment-templates', action, bypass: 'standard' })

    assert.deepEqual(ASSESSMENT_TEMPLATES_PERMISSION_DECLARATIONS, {
      indexAssessmentTemplates: standard('read'),
      storeAssessmentTemplate: standard('create'),
      showAssessmentTemplate: standard('read'),
      updateAssessmentTemplate: standard('update'),
      reorderAssessmentTemplateDimensions: standard('update'),
      deleteAssessmentTemplate: standard('delete'),
      indexAssessmentTemplateDimensions: standard('read'),
      storeAssessmentTemplateDimension: standard('update'),
      showAssessmentTemplateDimension: standard('read'),
      updateAssessmentTemplateDimension: standard('update'),
      deleteAssessmentTemplateDimension: standard('update'),
      storePositionAssessmentProfile: standard('update'),
      showPositionAssessmentProfile: standard('read'),
      updatePositionAssessmentProfile: standard('update'),
      deletePositionAssessmentProfile: standard('update'),
    })
  })

  test('certifications: el CRUD del catálogo y sus categorías piden su verbo en el módulo propio', ({ assert }) => {
    const standard = (action: string) => ({ module: 'certifications', action, bypass: 'standard' })

    assert.deepEqual(CERTIFICATIONS_PERMISSION_DECLARATIONS, {
      indexCertificationCategories: standard('read'),
      createCertification: standard('create'),
      updateCertification: standard('update'),
      deleteCertification: standard('delete'),
    })
  })

  test('competencies: editar nivel es update estricto; alta de descriptor y rango acepta create o update', ({
    assert,
  }) => {
    const standard = (action: string | string[]) => ({ module: 'competencies', action, bypass: 'standard' })

    assert.deepEqual(COMPETENCIES_PERMISSION_DECLARATIONS, {
      storeCompetency: standard('create'),
      showCompetency: standard('read'),
      updateCompetency: standard('update'),
      deleteCompetency: standard('delete'),
      storeBusinessUnitCompetencyLevel: standard('create'),
      showBusinessUnitCompetencyLevel: standard('read'),
      updateBusinessUnitCompetencyLevel: standard('update'),
      deleteBusinessUnitCompetencyLevel: standard('delete'),
      storeCompetencyDescriptor: standard(['create', 'update']),
      showCompetencyDescriptor: standard('read'),
      updateCompetencyDescriptor: standard('update'),
      deleteCompetencyDescriptor: standard('update'),
      indexCompetencyDescriptorsByCompetency: standard('read'),
      storeCompetencyBracket: standard(['create', 'update']),
      showCompetencyBracket: standard('read'),
      updateCompetencyBracket: standard('update'),
      deleteCompetencyBracket: standard('update'),
    })
  })

  test('los tres módulos tienen la exigencia encendida en la constante', ({ assert }) => {
    // Con la exigencia apagada el gate deja pasar a cualquier sesión y las
    // rutas de abajo quedarían abiertas aunque declaren su gate.
    for (const slug of ['assessment-templates', 'certifications', 'competencies']) {
      const systemModule = SYSTEM_MODULES.find((current) => current.systemModuleSlug === slug)
      assert.isTrue(systemModule?.systemModulePermissionEnforcementActive, slug)
    }
  })
})

test.group('Parámetros de evaluación — rutas de plantillas, dimensiones y perfiles por puesto', () => {
  test('plantillas: CRUD y reorden declaran su gate; toggle de estatus lo verifica el controller', ({
    assert,
  }) => {
    const content = readSource('start/routes/assessment_template_routes.ts')
    const handler = (method: string) => `#controllers/assessment_template_controller.${method}`

    assertRouteGated(assert, content, { method: 'get', path: '/', handler: handler('index'), gate: templatesGate('indexAssessmentTemplates') })
    assertRouteGated(assert, content, { method: 'post', path: '/', handler: handler('store'), gate: templatesGate('storeAssessmentTemplate') })
    assertRouteGated(assert, content, { method: 'get', path: '/:assessmentTemplateId', handler: handler('show'), gate: templatesGate('showAssessmentTemplate') })
    assertRouteGated(assert, content, { method: 'put', path: '/:assessmentTemplateId', handler: handler('update'), gate: templatesGate('updateAssessmentTemplate') })
    assertRouteGated(assert, content, { method: 'patch', path: '/:assessmentTemplateId/dimensions/reorder', handler: handler('reorderDimensions'), gate: templatesGate('reorderAssessmentTemplateDimensions') })
    assertRouteGated(assert, content, { method: 'delete', path: '/:assessmentTemplateId', handler: handler('delete'), gate: templatesGate('deleteAssessmentTemplate') })

    assertRouteOpen(assert, content, { method: 'patch', path: '/:assessmentTemplateId/status', handler: handler('toggleStatus') })
    // Si alguien quita la verificación del controller, el toggle queda abierto.
    assert.include(
      compactSource(readSource('app/controllers/assessment_template_controller.ts')),
      "hasAccess(user.roleId,'assessment-templates','toggle-status')"
    )
  })

  test('dimensiones: las cinco rutas declaran su gate', ({ assert }) => {
    const content = readSource('start/routes/assessment_template_dimension_routes.ts')
    const handler = (method: string) => `#controllers/assessment_template_dimension_controller.${method}`

    assertRouteGated(assert, content, { method: 'get', path: '/', handler: handler('index'), gate: templatesGate('indexAssessmentTemplateDimensions') })
    assertRouteGated(assert, content, { method: 'post', path: '/', handler: handler('store'), gate: templatesGate('storeAssessmentTemplateDimension') })
    assertRouteGated(assert, content, { method: 'get', path: '/:assessmentTemplateDimensionId', handler: handler('show'), gate: templatesGate('showAssessmentTemplateDimension') })
    assertRouteGated(assert, content, { method: 'put', path: '/:assessmentTemplateDimensionId', handler: handler('update'), gate: templatesGate('updateAssessmentTemplateDimension') })
    assertRouteGated(assert, content, { method: 'delete', path: '/:assessmentTemplateDimensionId', handler: handler('delete'), gate: templatesGate('deleteAssessmentTemplateDimension') })
  })

  test('perfiles por puesto: la lista queda abierta para assessments del empleado; el resto declara su gate', ({
    assert,
  }) => {
    const content = readSource('start/routes/position_assessment_profile_routes.ts')
    const handler = (method: string) => `#controllers/position_assessment_profile_controller.${method}`

    assertRouteOpen(assert, content, { method: 'get', path: '/', handler: handler('index') })
    assertRouteGated(assert, content, { method: 'post', path: '/', handler: handler('store'), gate: templatesGate('storePositionAssessmentProfile') })
    assertRouteGated(assert, content, { method: 'get', path: '/:positionAssessmentProfileId', handler: handler('show'), gate: templatesGate('showPositionAssessmentProfile') })
    assertRouteGated(assert, content, { method: 'put', path: '/:positionAssessmentProfileId', handler: handler('update'), gate: templatesGate('updatePositionAssessmentProfile') })
    assertRouteGated(assert, content, { method: 'delete', path: '/:positionAssessmentProfileId', handler: handler('delete'), gate: templatesGate('deletePositionAssessmentProfile') })
  })
})

test.group('Catálogo de certificaciones — start/routes/certifications_routes.ts', () => {
  test('escrituras y categorías declaran el gate de certifications; la lista queda abierta', ({
    assert,
  }) => {
    const content = readSource('start/routes/certifications_routes.ts')
    const handler = (method: string) => `#controllers/certifications_controller.${method}`

    assertRouteGated(assert, content, { method: 'post', path: '/certifications', handler: handler('store'), gate: certificationsGate('createCertification') })
    assertRouteGated(assert, content, { method: 'put', path: '/certifications/:id', handler: handler('update'), gate: certificationsGate('updateCertification') })
    assertRouteGated(assert, content, { method: 'delete', path: '/certifications/:id', handler: handler('destroy'), gate: certificationsGate('deleteCertification') })

    assertRouteOpen(assert, content, { method: 'get', path: '/certifications', handler: handler('index') })
    assertRouteGated(assert, content, { method: 'get', path: '/certification-categories', handler: handler('indexCategories'), gate: certificationsGate('indexCertificationCategories') })
  })
})

test.group('Competencias — competencias, niveles, descriptores y rangos', () => {
  test('competencias: la lista queda abierta para el Organigrama; detalle y escrituras declaran su gate', ({
    assert,
  }) => {
    const content = readSource('start/routes/competency_routes.ts')
    const handler = (method: string) => `#controllers/competency_controller.${method}`

    assertRouteOpen(assert, content, { method: 'get', path: '/', handler: handler('index') })
    assertRouteGated(assert, content, { method: 'post', path: '/', handler: handler('store'), gate: competenciesGate('storeCompetency') })
    assertRouteGated(assert, content, { method: 'get', path: '/:competencyId', handler: handler('show'), gate: competenciesGate('showCompetency') })
    assertRouteGated(assert, content, { method: 'put', path: '/:competencyId', handler: handler('update'), gate: competenciesGate('updateCompetency') })
    assertRouteGated(assert, content, { method: 'delete', path: '/:competencyId', handler: handler('delete'), gate: competenciesGate('deleteCompetency') })
  })

  test('niveles: la lista queda abierta para matriz y evaluaciones; detalle y escrituras declaran su gate', ({
    assert,
  }) => {
    const content = readSource('start/routes/business_unit_competency_level_routes.ts')
    const handler = (method: string) => `#controllers/business_unit_competency_level_controller.${method}`

    assertRouteOpen(assert, content, { method: 'get', path: '/', handler: handler('index') })
    assertRouteGated(assert, content, { method: 'post', path: '/', handler: handler('store'), gate: competenciesGate('storeBusinessUnitCompetencyLevel') })
    assertRouteGated(assert, content, { method: 'get', path: '/:businessUnitCompetencyLevelId', handler: handler('show'), gate: competenciesGate('showBusinessUnitCompetencyLevel') })
    assertRouteGated(assert, content, { method: 'put', path: '/:businessUnitCompetencyLevelId', handler: handler('update'), gate: competenciesGate('updateBusinessUnitCompetencyLevel') })
    assertRouteGated(assert, content, { method: 'delete', path: '/:businessUnitCompetencyLevelId', handler: handler('delete'), gate: competenciesGate('deleteBusinessUnitCompetencyLevel') })
  })

  test('descriptores: las cinco rutas declaran su gate', ({ assert }) => {
    const content = readSource('start/routes/competency_descriptor_routes.ts')
    const handler = (method: string) => `#controllers/competency_descriptor_controller.${method}`

    assertRouteGated(assert, content, { method: 'post', path: '/', handler: handler('store'), gate: competenciesGate('storeCompetencyDescriptor') })
    assertRouteGated(assert, content, { method: 'get', path: '/:competencyDescriptorId', handler: handler('show'), gate: competenciesGate('showCompetencyDescriptor') })
    assertRouteGated(assert, content, { method: 'put', path: '/:competencyDescriptorId', handler: handler('update'), gate: competenciesGate('updateCompetencyDescriptor') })
    assertRouteGated(assert, content, { method: 'delete', path: '/:competencyDescriptorId', handler: handler('delete'), gate: competenciesGate('deleteCompetencyDescriptor') })
    assertRouteGated(assert, content, { method: 'get', path: '/by-competency/:competencyId', handler: handler('getByCompetencyId'), gate: competenciesGate('indexCompetencyDescriptorsByCompetency') })
  })

  test('rangos: rangos por descriptor quedan abiertos para la evaluación del empleado; el resto declara su gate', ({
    assert,
  }) => {
    const content = readSource('start/routes/competency_bracket_routes.ts')
    const handler = (method: string) => `#controllers/competency_bracket_controller.${method}`

    assertRouteGated(assert, content, { method: 'post', path: '/', handler: handler('store'), gate: competenciesGate('storeCompetencyBracket') })
    assertRouteGated(assert, content, { method: 'get', path: '/:competencyBracketId', handler: handler('show'), gate: competenciesGate('showCompetencyBracket') })
    assertRouteGated(assert, content, { method: 'put', path: '/:competencyBracketId', handler: handler('update'), gate: competenciesGate('updateCompetencyBracket') })
    assertRouteGated(assert, content, { method: 'delete', path: '/:competencyBracketId', handler: handler('delete'), gate: competenciesGate('deleteCompetencyBracket') })

    assertRouteOpen(assert, content, { method: 'get', path: '/by-descriptor/:competencyDescriptorId', handler: handler('getByCompetencyDescriptorId') })
  })
})
