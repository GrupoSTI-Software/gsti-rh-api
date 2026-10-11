import { test } from '@japa/runner'
import { sanitizeAnnouncementSlideHtml } from '#modules/announcements/domain/announcement_slide_html'
import {
  isDeclaredPermissionKey,
  parsePermissionKey,
} from '#modules/announcements/domain/permission_key'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'
import { SYSTEM_MODULES } from '#constants/system_modules_menu/system_modules.constant'

test.group('Anuncios | sanitizeAnnouncementSlideHtml', () => {
  test('quita script con su contenido y atributos on*', ({ assert }) => {
    const html = sanitizeAnnouncementSlideHtml(
      '<p onclick="alert(1)">Hola<script>alert(2)</script></p><img src=x onerror="alert(3)">'
    )
    assert.equal(html, '<p>Hola</p>')
  })

  test('conserva la allowlist y quita lo demás conservando el texto', ({ assert }) => {
    const html = sanitizeAnnouncementSlideHtml(
      '<h1>Título</h1><p><strong>a</strong><em>b</em><u>c</u><br></p><ul><li>x</li></ul><ol><li>y</li></ol><span style="color:red">z</span>'
    )
    assert.equal(
      html,
      'Título<p><strong>a</strong><em>b</em><u>c</u><br /></p><ul><li>x</li></ul><ol><li>y</li></ol>z'
    )
  })

  test('fuerza rel y target en enlaces http, https y mailto', ({ assert }) => {
    const html = sanitizeAnnouncementSlideHtml(
      '<a href="https://valanserh.com" rel="opener" target="_self">a</a><a href="mailto:x@y.mx">b</a>'
    )
    assert.equal(
      html,
      '<a href="https://valanserh.com" rel="noopener noreferrer" target="_blank">a</a>' +
        '<a href="mailto:x@y.mx" rel="noopener noreferrer" target="_blank">b</a>'
    )
  })

  test('elimina href con javascript:, data: o protocol-relative', ({ assert }) => {
    const html = sanitizeAnnouncementSlideHtml(
      '<a href="javascript:alert(1)">a</a><a href="data:text/html,x">b</a><a href="//evil.com">c</a>'
    )
    assert.notInclude(html, 'javascript:')
    assert.notInclude(html, 'data:')
    assert.notInclude(html, 'evil.com')
  })
})

test.group('Anuncios | permission_key', () => {
  test('parsePermissionKey separa módulo y permiso', ({ assert }) => {
    assert.deepEqual(parsePermissionKey('modulo:permiso'), {
      moduleSlug: 'modulo',
      permissionSlug: 'permiso',
    })
    assert.isNull(parsePermissionKey('modulo'))
    assert.isNull(parsePermissionKey(':read'))
    assert.isNull(parsePermissionKey('a:b:c'))
  })

  test('acepta toda clave declarada en el catálogo de módulos no retirados', ({ assert }) => {
    for (const systemModule of SYSTEM_MODULES) {
      if (systemModule.systemModuleRetired) continue
      for (const permission of systemModule.systemModulePermissions) {
        const key = `${systemModule.systemModuleSlug}:${permission.systemPermissionSlug}`
        assert.isTrue(isDeclaredPermissionKey(key), key)
      }
    }
  })

  test('acepta la clave del listado de empleados, que usa el seeder del deck', ({ assert }) => {
    const { module, action } = EMPLOYEES_READ_PERMISSION_DECLARATIONS.indexEmployees
    assert.isTrue(isDeclaredPermissionKey(`${module}:${String(action)}`))
  })

  test('rechaza módulo o permiso inexistente', ({ assert }) => {
    const { module } = EMPLOYEES_READ_PERMISSION_DECLARATIONS.indexEmployees
    assert.isFalse(isDeclaredPermissionKey(`${module}:permiso-inexistente`))
    assert.isFalse(isDeclaredPermissionKey('modulo-inexistente:permiso'))
    assert.isFalse(isDeclaredPermissionKey(module))
  })
})
