import { BaseSeeder } from '@adonisjs/lucid/seeders'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import SystemPermission from '#models/system_permission'
import TenantRoleProvisioningService from '#services/tenant_role_provisioning_service'

/**
 * Da a cada empresa ya sembrada su juego propio de roles: dueño, administrador
 * y colaborador.
 *
 * Usa el MISMO servicio que el alta real de un tenant, para que una base recién
 * creada quede en el estado que tendría una empresa dada de alta por la
 * aplicación, y no en uno que solo existe en desarrollo.
 *
 * ORDEN. Corre después de `0062_system_module_seeder`, y no junto a
 * `0006_role_seeder`, porque el administrador nace con todos los permisos vivos
 * del catálogo y ese catálogo lo escribe 0062. Sembrado antes, el administrador
 * nacía mudo —con cero concesiones— y la siembra no lo repone después, porque
 * reparte la matriz una sola vez, al crear el rol.
 *
 * Esa dependencia se comprueba en vez de confiarse: sin permisos vivos en la
 * base, el seeder falla en lugar de dejar administradores vacíos que nadie
 * notaría hasta que un cliente no pudiera entrar a ningún módulo.
 *
 * Idempotente: `provision` respeta lo que ya existe y nunca pisa la matriz que
 * el cliente haya ajustado.
 */
export default class extends BaseSeeder {
  async run() {
    const businessUnits = await BusinessUnit.query()
      .whereNull('business_unit_deleted_at')
      .select('business_unit_id')

    if (businessUnits.length === 0) {
      return
    }

    const [livePermissions] = await SystemPermission.query()
      .whereNull('system_permission_deleted_at')
      .count('* as total')

    if (Number(livePermissions.$extras.total ?? 0) === 0) {
      throw new Error(
        '[0064_tenant_roles_seeder] El catálogo de permisos está vacío: corre antes ' +
          '`0062_system_module_seeder`. Sembrar ahora dejaría al rol `admin` sin un solo permiso.'
      )
    }

    const provisioningService = new TenantRoleProvisioningService()

    for (const businessUnit of businessUnits) {
      await db.transaction(async (trx) => {
        await provisioningService.provision(businessUnit.businessUnitId, trx)
      })
    }
  }
}
