import { test } from '@japa/runner'
import { TenantContext } from '#utils/tenant_context'
import EmployeeCertificationExpirationService from '#services/employee_certification_expiration_service'

/**
 * USRH1783821206584 — `EmployeeCertificationExpirationService` consulta con
 * `db.from()` (knex crudo): el mixin `withBusinessUnitScope()` no aplica ahí.
 * El reporte cross-empleado de vencimientos se acota manualmente al scope
 * activo, con la misma semántica fail-closed que el mixin del cimiento.
 *
 * Estos tests no requieren BD: verifican que el servicio no lanza y respeta
 * el contrato de TenantContext (sin contexto activo -> no filtra; contexto
 * activo con scope vacío -> sin resultados, nunca "todos los empleados").
 */
test.group('EmployeeCertificationExpirationService — scope del reporte', () => {
  test('sin TenantContext activo no lanza (comportamiento histórico preservado)', async ({
    assert,
  }) => {
    assert.isFalse(TenantContext.isActive())
    const service = new EmployeeCertificationExpirationService()
    // Solo se verifica que la llamada no explote por la ausencia de contexto;
    // el resultado depende de datos reales, fuera de alcance sin BD.
    await assert.doesNotRejects(() => service.getExpiredAndExpiring())
  })

  test('con TenantContext activo y scope vacío, no lanza y no degrada a lista global', async ({
    assert,
  }) => {
    const rows = await TenantContext.run([], async () => {
      const service = new EmployeeCertificationExpirationService()
      return service.getExpiredAndExpiring()
    })

    assert.isArray(rows)
    assert.lengthOf(rows, 0)
  })
})
