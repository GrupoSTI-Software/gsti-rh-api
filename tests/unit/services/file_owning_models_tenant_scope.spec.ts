import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Auditoría de los modelos que guardan una referencia a un archivo y NO
 * componen `withBusinessUnitScope`.
 *
 * No tener el mixin no implica agujero: varios acotan por su cuenta (los
 * adjuntos del buzón filtran por las empresas permitidas, los reportes por
 * usuario, los pagos viven tras `platformAdmin`). Los que sí lo tenían se
 * corrigieron acotando por la relación con un modelo que sí es tenant-scoped,
 * y esta suite fija esos candados para que no se pierdan en una edición futura.
 */
async function leer(ruta: string): Promise<string> {
  return readFile(join(process.cwd(), ruta), 'utf-8')
}

test.group('Modelos con archivos — acotamiento por empresa', () => {
  test('el borrado de archivos de aviso se limita al aviso en edición', async ({ assert }) => {
    const content = await leer('app/controllers/notice_controller.ts')

    // `filesDeleted` llega en el cuerpo de la petición: sin el `where` del
    // aviso se podía borrar el archivo de otra empresa, y su objeto del bucket.
    assert.match(
      content.replace(/\s+/g, ''),
      /\.where\('notice_file_id',fileDeleted\)\.where\('notice_id',notice\.noticeId\)/
    )
  })

  test('la foto de insumo se resuelve por la relación con el insumo', async ({ assert }) => {
    const content = await leer('app/services/employee_suppply_assignament_photo_service.ts')

    // `EmployeeSupplie` sí es tenant-scoped; la foto hereda el filtro de ahí.
    assert.include(content, "whereIn('employee_supply_id', EmployeeSupplie.query()")
  })

  test('las razones sociales se acotan a los ajustes de la empresa activa', async ({ assert }) => {
    const servicio = await leer('app/services/system_setting_trade_name_service.ts')

    assert.include(servicio, 'private scopedQuery()')
    assert.include(servicio, 'TenantContext.getScope()')
    // La configuración global (sin empresa) sigue siendo visible para todos.
    assert.include(servicio, "orWhereNull('business_unit_id')")
  })

  test('el controlador de razones sociales no consulta el modelo sin acotar', async ({
    assert,
  }) => {
    const controlador = await leer('app/controllers/system_setting_trade_name_controller.ts')

    assert.notInclude(
      controlador.replace(/\s+/g, ''),
      "SystemSettingTradeName.query().whereNull('system_setting_deleted_at').where('system_setting_trade_name_id'",
      'debe pasar por el servicio para heredar el filtro de empresa'
    )
  })

  test('los grupos de rutas afectados activan el contexto de empresa', async ({ assert }) => {
    // Sin `businessScope()` el `TenantContext` no se activa y ningún filtro
    // por empresa aplica, tenga o no el modelo su mixin.
    const grupos = [
      'start/routes/system_setting_trade_name_routes.ts',
      'start/routes/shift_exception_evidence_routes.ts',
      'start/routes/notice_routes.ts',
      'start/routes/employee_supply_assignament_photo.ts',
    ]

    for (const ruta of grupos) {
      const archivo = await leer(ruta)
      const content = archivo.replace(/\s+/g, '')
      assert.include(content, '.use(middleware.businessScope())', `${ruta} sin businessScope`)
    }
  })
})
