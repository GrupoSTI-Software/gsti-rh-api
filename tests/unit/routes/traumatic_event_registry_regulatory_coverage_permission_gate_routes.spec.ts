import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import { SYSTEM_MODULES } from '#constants/system_modules_menu/system_modules.constant'
import { TRAUMATIC_EVENT_REPORTS_REGISTRY_PERMISSION_DECLARATIONS } from '#constants/traumatic_event_reports_registry_permission_declarations'
import {
  assertRouteGated,
  assertRouteOpen,
  compactSource,
  gateExpression,
  readSource,
} from '#tests/helpers/route_gate_assertions'

/**
 * Protección vigente en el API del Registro auditable de eventos traumáticos:
 * qué ruta declara `permissionGate`, con qué declaración, y cuál queda abierta
 * a propósito.
 *
 * Abiertas: el catálogo de tipos de evento (lo leen el formulario de reportes y
 * la app del colaborador) y el CRUD de reportes, que es de otro módulo y lo
 * verifica su controller.
 */

const REGISTRY = 'TRAUMATIC_EVENT_REPORTS_REGISTRY_PERMISSION_DECLARATIONS'

/**
 * Cuerpo de un método de controller: desde su firma hasta el siguiente método,
 * helper privado o bloque de documentación.
 */
function methodSource(assert: Assert, source: string, name: string): string {
  const start = source.indexOf(`\n  async ${name}(`)
  assert.isAbove(start, -1, `${name} debe existir`)

  const rest = source.slice(start + 1)
  const next = rest.slice(1).search(/\n {2}(async |private |\/\*\*)/)
  return next === -1 ? rest : rest.slice(0, next + 1)
}

test.group('Registro auditable — declaraciones y catálogo', () => {
  test('el registro pide traumatic-event-reports-registry:read en lista y PDF, con bypass standard', ({
    assert,
  }) => {
    const read = { module: 'traumatic-event-reports-registry', action: 'read', bypass: 'standard' }

    assert.deepEqual(TRAUMATIC_EVENT_REPORTS_REGISTRY_PERMISSION_DECLARATIONS, {
      registry: read,
      registryExport: read,
    })
  })

  test('el módulo tiene la exigencia encendida y solo declara read', ({ assert }) => {
    for (const slug of ['traumatic-event-reports-registry']) {
      const systemModule = SYSTEM_MODULES.find((entry) => entry.systemModuleSlug === slug)

      assert.exists(systemModule, slug)
      assert.isTrue(systemModule!.systemModulePermissionEnforcementActive, slug)
      assert.deepEqual(
        systemModule!.systemModulePermissions.map((permission) => permission.systemPermissionSlug),
        ['read'],
        slug
      )
    }
  })
})

test.group('Registro auditable — start/routes/traumatic_event_report_routes.ts', () => {
  const handler = (method: string) => `#controllers/traumatic_event_report_controller.${method}`

  test('lista y PDF del registro declaran su gate; el CRUD de reportes queda sin gate de ruta', ({
    assert,
  }) => {
    const content = readSource('start/routes/traumatic_event_report_routes.ts')
    const decl = (key: keyof typeof TRAUMATIC_EVENT_REPORTS_REGISTRY_PERMISSION_DECLARATIONS) =>
      gateExpression(REGISTRY, TRAUMATIC_EVENT_REPORTS_REGISTRY_PERMISSION_DECLARATIONS, key)

    assertRouteGated(assert, content, {
      method: 'get',
      path: '/traumatic-event-reports/registry',
      handler: handler('registry'),
      gate: decl('registry'),
    })
    assertRouteGated(assert, content, {
      method: 'get',
      path: '/traumatic-event-reports/registry/export',
      handler: handler('registryExport'),
      gate: decl('registryExport'),
    })

    // Módulo traumatic-event-reports: su controller verifica con assertHasPermission.
    assertRouteOpen(assert, content, {
      method: 'get',
      path: '/traumatic-event-reports',
      handler: handler('index'),
    })
    assertRouteOpen(assert, content, {
      method: 'post',
      path: '/traumatic-event-reports',
      handler: handler('store'),
    })
    assertRouteOpen(assert, content, {
      method: 'get',
      path: '/traumatic-event-reports/:reportId/printable-document',
      handler: handler('printableDocument'),
    })
    assertRouteOpen(assert, content, {
      method: 'get',
      path: '/traumatic-event-reports/:id',
      handler: handler('show'),
    })
    assertRouteOpen(assert, content, {
      method: 'put',
      path: '/traumatic-event-reports/:id',
      handler: handler('update'),
    })
    assertRouteOpen(assert, content, {
      method: 'delete',
      path: '/traumatic-event-reports/:id',
      handler: handler('destroy'),
    })

    // "registry" debe registrarse antes de `/:id` o se leería como identificador.
    const flat = compactSource(content)
    assert.isBelow(
      flat.indexOf("'/traumatic-event-reports/registry'"),
      flat.indexOf("'/traumatic-event-reports/:id'")
    )
  })

  test('registry y registryExport ya no repiten la verificación contra traumatic-event-reports', ({
    assert,
  }) => {
    // Con assertHasPermission el controller seguía pidiendo traumatic-event-reports:read
    // y el permiso del registro no alcanzaba para abrirlo.
    // Se busca la llamada, no el nombre: un comentario que la mencione no verifica nada.
    const legacyCheck = 'this.assertHasPermission('
    const controller = readSource('app/controllers/traumatic_event_report_controller.ts')

    assert.notInclude(methodSource(assert, controller, 'registry'), legacyCheck)
    assert.notInclude(methodSource(assert, controller, 'registryExport'), legacyCheck)

    // Fuera de alcance: el CRUD y el escrito imprimible siguen en su módulo.
    assert.include(methodSource(assert, controller, 'index'), legacyCheck)
    assert.include(methodSource(assert, controller, 'printableDocument'), legacyCheck)
  })

  test('el catálogo de tipos de evento queda abierto (formulario de reportes y app del colaborador)', ({
    assert,
  }) => {
    assertRouteOpen(assert, readSource('start/routes/traumatic_event_type_routes.ts'), {
      method: 'get',
      path: '/',
      handler: '#controllers/traumatic_event_type_controller.index',
    })
  })
})
