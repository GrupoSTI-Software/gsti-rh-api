import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Regla de la salida de archivos, fijada aquí para que no se erosione:
 *
 * 1. El cliente pide un RECURSO por su id; la clave del objeto la resuelve el
 *    servidor. Nunca se acepta una ruta ni una URL en la petición — eso era
 *    `GET /api/proxy-image`, que se retiró por SSRF.
 * 2. Todo endpoint de salida vive detrás de `auth()`, `businessScope()` y su
 *    `permissionGate`. Sin `businessScope()` el `TenantContext` no se activa y
 *    el filtro de empresa de los modelos NO se aplica, aunque el modelo lo
 *    componga.
 */
function compact(content: string): string {
  return content.replace(/\s+/g, '')
}

async function leer(ruta: string): Promise<string> {
  return readFile(join(process.cwd(), ruta), 'utf-8')
}

const GRUPOS_CON_SALIDA_DE_ARCHIVOS = [
  'start/routes/employee_photo_routes.ts',
  'start/routes/shift_exception_evidence_routes.ts',
]

test.group('Salida de archivos — candados de tenant y permisos', () => {
  for (const ruta of GRUPOS_CON_SALIDA_DE_ARCHIVOS) {
    test(`${ruta} monta auth() y businessScope()`, async ({ assert }) => {
      const content = compact(await leer(ruta))

      assert.include(content, '.use(middleware.auth())', 'falta auth()')
      assert.include(
        content,
        '.use(middleware.businessScope())',
        'sin businessScope el TenantContext no se activa y el filtro de empresa no aplica'
      )
    })

    test(`${ruta} declara permissionGate en la salida del archivo`, async ({ assert }) => {
      const content = compact(await leer(ruta))
      const salidas = content.match(/router\.get\('[^']*(?:photo|file)'[^)]*\)\.use\(middleware\.permissionGate/g)

      assert.isNotNull(salidas, 'la ruta de salida de archivo debe declarar permissionGate')
    })
  }

  test('las evidencias de turno heredan el scope de shift_exception', async ({ assert }) => {
    const content = await leer('app/services/shift_exception_evidence_service.ts')

    // `ShiftExceptionEvidence` no compone el mixin de tenant, así que la
    // consulta debe acotarse por la relación o vuelve el IDOR.
    assert.include(content, 'private scopedQuery()')
    assert.match(content, /whereIn\(\s*'shift_exception_id',/)
    assert.include(content, 'ShiftException.query()')
  })

  test('ninguna lectura de evidencias consulta el modelo sin acotar', async ({ assert }) => {
    const servicio = await leer('app/services/shift_exception_evidence_service.ts')
    const controlador = await leer('app/controllers/shift_exception_evidence_controller.ts')

    // Fuera de `scopedQuery`, el servicio no debe abrir consultas de lectura
    // directas sobre el modelo.
    const consultasDirectas = servicio.match(/ShiftExceptionEvidence\.query\(\)/g) ?? []
    assert.lengthOf(
      consultasDirectas,
      1,
      'solo `scopedQuery` puede consultar ShiftExceptionEvidence directamente'
    )

    // Se compara sobre el texto compactado: la version anterior de esta
    // asercion buscaba una cadena de una sola linea dentro de codigo indentado
    // y multilinea, asi que NUNCA coincidia y el test pasaba sin comprobar nada.
    // Mientras tanto, `update` y `delete` seguian consultando el modelo directo.
    assert.notInclude(
      compact(controlador),
      'ShiftExceptionEvidence.query()',
      'el controlador debe pasar por el servicio para heredar el scope de empresa'
    )
  })

  test('las escrituras de evidencias tambien pasan por el servicio acotado', async ({
    assert,
  }) => {
    const controlador = compact(await leer('app/controllers/shift_exception_evidence_controller.ts'))

    // `update` y `delete`: el borrado ademas arrastra el objeto del bucket, asi
    // que un identificador ajeno destruia datos de otra empresa.
    const llamadasAlServicio = controlador.match(/newShiftExceptionEvidenceService\(\)\.show\(/g) ?? []

    assert.isAtLeast(
      llamadasAlServicio.length,
      2,
      'update y delete deben resolver la evidencia por el servicio acotado'
    )
  })

  test('el alta de razon social resuelve su ajuste padre dentro del scope', async ({ assert }) => {
    const controlador = compact(
      await leer('app/controllers/system_setting_trade_name_controller.ts')
    )
    const servicio = await leer('app/services/system_setting_trade_name_service.ts')

    assert.notInclude(
      controlador,
      'SystemSetting.query()',
      'el `systemSettingId` llega del cuerpo: debe resolverse acotado'
    )
    assert.include(servicio, 'async findScopedSystemSetting(')
    assert.include(servicio, 'TenantContext.getScope()')
  })

  test('los controladores de salida no aceptan rutas ni URLs del cliente', async ({ assert }) => {
    const controladores = [
      'app/controllers/employee_photo_stream_controller.ts',
      'app/controllers/shift_exception_evidence_stream_controller.ts',
    ]

    for (const ruta of controladores) {
      const content = await leer(ruta)

      assert.notInclude(content, "request.input('url')", `${ruta} acepta una URL del cliente`)
      assert.notInclude(content, "request.input('path')", `${ruta} acepta una ruta del cliente`)
      assert.notInclude(content, 'request.qs()', `${ruta} lee query string sin acotar`)
    }
  })
})
