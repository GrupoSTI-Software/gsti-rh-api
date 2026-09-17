import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { SYSTEM_MODULES } from '#constants/system_modules_menu/system_modules.constant'
import { CAREER_PATH_TEMPLATES_PERMISSION_DECLARATIONS } from '#constants/career_path_templates_permission_declarations'
import { HR_CAREER_PATH_PERMISSION_DECLARATIONS } from '#constants/hr_career_path_permission_declarations'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'
import { EMPLOYEES_WRITE_PERMISSION_DECLARATIONS } from '#constants/employees_write_permission_declarations'
import {
  assertRouteGated,
  assertRouteOpen,
  gateExpression,
  readSource,
} from '#tests/helpers/route_gate_assertions'

/**
 * Protección vigente en el API de Catálogo de rutas de carrera, Bandeja de
 * rutas de carrera, Matriz de competencias y Matriz 9 Box.
 *
 *  - Catálogo: escrituras y detalle con su verbo; la lista queda abierta porque
 *    la pestaña Ruta de carrera del expediente la usa para proponer.
 *  - Bandeja: listar, ver y cambiar estatus salen de Empleados y piden
 *    `hr-career-path`; proponer, borrar y leer por empleado siguen en la pestaña.
 *  - Matrices: no tienen endpoint propio (arman la vista con lecturas de
 *    Empleados y catálogos compartidos), así que no declaran nada y su exigencia
 *    sigue apagada. Su `read` solo lo consulta el guard del backoffice.
 */

const TEMPLATES = 'CAREER_PATH_TEMPLATES_PERMISSION_DECLARATIONS'
const INBOX = 'HR_CAREER_PATH_PERMISSION_DECLARATIONS'
const EMPLOYEES_READ = 'EMPLOYEES_READ_PERMISSION_DECLARATIONS'
const EMPLOYEES_WRITE = 'EMPLOYEES_WRITE_PERMISSION_DECLARATIONS'

const templatesGate = (key: keyof typeof CAREER_PATH_TEMPLATES_PERMISSION_DECLARATIONS) =>
  gateExpression(TEMPLATES, CAREER_PATH_TEMPLATES_PERMISSION_DECLARATIONS, key)
const inboxGate = (key: keyof typeof HR_CAREER_PATH_PERMISSION_DECLARATIONS) =>
  gateExpression(INBOX, HR_CAREER_PATH_PERMISSION_DECLARATIONS, key)

const moduleBySlug = (slug: string) =>
  SYSTEM_MODULES.find((systemModule) => systemModule.systemModuleSlug === slug)

const permissionSlugs = (slug: string) =>
  (moduleBySlug(slug)?.systemModulePermissions ?? []).map(
    (permission) => permission.systemPermissionSlug
  )

test.group('Rutas de carrera y matrices — declaraciones y exigencia', () => {
  test('career-path-templates: detalle read, alta create, edición update y baja delete; bypass standard', ({
    assert,
  }) => {
    const standard = (action: string) => ({
      module: 'career-path-templates',
      action,
      bypass: 'standard',
    })

    assert.deepEqual(CAREER_PATH_TEMPLATES_PERMISSION_DECLARATIONS, {
      storeCareerPathTemplate: standard('create'),
      showCareerPathTemplate: standard('read'),
      updateCareerPathTemplate: standard('update'),
      deleteCareerPathTemplate: standard('delete'),
    })
  })

  test('hr-career-path: listar y ver piden read; cambiar estatus pide update; bypass standard', ({
    assert,
  }) => {
    const standard = (action: string) => ({ module: 'hr-career-path', action, bypass: 'standard' })

    assert.deepEqual(HR_CAREER_PATH_PERMISSION_DECLARATIONS, {
      indexCareerPathCandidates: standard('read'),
      showCareerPathCandidate: standard('read'),
      updateCareerPathCandidateStatus: standard('update'),
    })
  })

  test('catálogo y bandeja tienen la exigencia encendida y declaran exactamente los permisos que se verifican', ({
    assert,
  }) => {
    // Con la exigencia apagada el gate deja pasar a cualquier sesión y las
    // rutas de abajo quedarían abiertas aunque declaren su gate.
    assert.isTrue(moduleBySlug('career-path-templates')?.systemModulePermissionEnforcementActive)
    assert.isTrue(moduleBySlug('hr-career-path')?.systemModulePermissionEnforcementActive)
    assert.sameMembers(permissionSlugs('career-path-templates'), ['read', 'create', 'update', 'delete'])
    assert.sameMembers(permissionSlugs('hr-career-path'), ['read', 'update'])
  })

  test('skills-matrix y matrix-9-box siguen con exigencia apagada, solo read y sin declaraciones del gate', ({
    assert,
  }) => {
    const declarationsDir = join(process.cwd(), 'app/constants')
    const declarationSources = readdirSync(declarationsDir)
      .filter((file) => file.endsWith('_permission_declarations.ts'))
      .map((file) => readFileSync(join(declarationsDir, file), 'utf-8'))

    for (const slug of ['skills-matrix', 'matrix-9-box']) {
      assert.isFalse(moduleBySlug(slug)?.systemModulePermissionEnforcementActive, slug)
      assert.deepEqual(permissionSlugs(slug), ['read'], slug)
      // Encender la exigencia sin una ruta que la declare no protege nada: si
      // aparece un endpoint propio, se declara aquí y se enciende con él.
      assert.isFalse(
        declarationSources.some((source) => source.includes(`'${slug}'`)),
        `${slug} no debe tener declaraciones del gate`
      )
    }
  })
})

test.group('Catálogo de rutas de carrera — rutas', () => {
  test('alta, detalle, edición y baja declaran su gate; la lista queda abierta', ({ assert }) => {
    const content = readSource('start/routes/career_path_template_routes.ts')
    const handler = (method: string) => `#controllers/career_path_template_controller.${method}`

    assertRouteOpen(assert, content, { method: 'get', path: '/', handler: handler('index') })
    assertRouteGated(assert, content, {
      method: 'post',
      path: '/',
      handler: handler('store'),
      gate: templatesGate('storeCareerPathTemplate'),
    })
    assertRouteGated(assert, content, {
      method: 'get',
      path: '/:careerPathTemplateId',
      handler: handler('show'),
      gate: templatesGate('showCareerPathTemplate'),
    })
    assertRouteGated(assert, content, {
      method: 'put',
      path: '/:careerPathTemplateId',
      handler: handler('update'),
      gate: templatesGate('updateCareerPathTemplate'),
    })
    assertRouteGated(assert, content, {
      method: 'delete',
      path: '/:careerPathTemplateId',
      handler: handler('delete'),
      gate: templatesGate('deleteCareerPathTemplate'),
    })
  })
})

test.group('Bandeja de rutas de carrera — rutas de candidatos', () => {
  test('listar, ver y cambiar estatus piden hr-career-path; proponer, borrar y leer por empleado siguen en Empleados', ({
    assert,
  }) => {
    const content = readSource('start/routes/career_path_candidate_routes.ts')
    const handler = (method: string) => `#controllers/career_path_candidate_controller.${method}`

    assertRouteGated(assert, content, {
      method: 'get',
      path: '/',
      handler: handler('index'),
      gate: inboxGate('indexCareerPathCandidates'),
    })
    assertRouteGated(assert, content, {
      method: 'get',
      path: '/:careerPathCandidateId',
      handler: handler('show'),
      gate: inboxGate('showCareerPathCandidate'),
    })
    assertRouteGated(assert, content, {
      method: 'put',
      path: '/:careerPathCandidateId',
      handler: handler('updateStatus'),
      gate: inboxGate('updateCareerPathCandidateStatus'),
    })
    assertRouteGated(assert, content, {
      method: 'post',
      path: '/',
      handler: handler('store'),
      gate: gateExpression(
        EMPLOYEES_WRITE,
        EMPLOYEES_WRITE_PERMISSION_DECLARATIONS,
        'createCareerPathCandidate'
      ),
    })
    assertRouteGated(assert, content, {
      method: 'delete',
      path: '/:careerPathCandidateId',
      handler: handler('delete'),
      gate: gateExpression(
        EMPLOYEES_WRITE,
        EMPLOYEES_WRITE_PERMISSION_DECLARATIONS,
        'deleteCareerPathCandidate'
      ),
    })
    assertRouteGated(assert, content, {
      method: 'get',
      path: '/employee/:employeeId',
      handler: handler('getByEmployeeId'),
      gate: gateExpression(
        EMPLOYEES_READ,
        EMPLOYEES_READ_PERMISSION_DECLARATIONS,
        'getCareerPathByEmployee'
      ),
    })
  })
})
