import { BaseSeeder } from '@adonisjs/lucid/seeders'
import SystemSettingSystemModule from '../../app/models/system_setting_system_module.js'
import { resolveSystemModuleGroupIds } from '../../app/helpers/system_module_group_seed_resolver.js'
import { upsertSystemModuleBySlug } from '../../app/helpers/system_catalog_seed_resolver.js'

/**
 * Registra en el sistema el módulo "Evidencia de aceptaciones" (USRH1783368377327).
 *
 * Pantalla de administración de PLATAFORMA, reservada al rol `root` (equipo GSTI):
 * consulta y export de solo lectura de la evidencia de aceptación de documentos
 * legales que el cimiento USRH1783101935670 ya registra. Ninguna empresa cliente
 * accede — la reserva real la impone `assertConsentEvidenceAccess`
 * (`app/helpers/consent_evidence_rbac.ts`), el vínculo al menú aquí es solo UX.
 *
 * Grupo nuevo `'7. Plataforma'`: no existe hoy un grupo de administración GSTI
 * separado de la configuración de empresa (`'4. Configuraciones'`); esta pantalla
 * es la primera de ese tipo.
 *
 * La identidad del módulo es su SLUG (`consent-evidence`): no declara id. Elegir
 * a mano un número libre es lo que hacía que dos seeders reclamaran el mismo id
 * y el segundo sobrescribiera al primero en silencio (ver
 * `app/helpers/system_catalog_seed_resolver.ts`). El id lo asigna la BD y lo
 * devuelve el resolver para vincular el módulo al system_setting activo.
 *
 * Los permisos de este módulo (`read`, `reveal`) y su asignación a `root` los
 * declara `0049_consent_evidence_permissions_seeder.ts`, no este seeder.
 *
 * Solo siembra configuración de sistema (no datos de negocio). Idempotente: usa
 * updateOrCreate/firstOrCreate; se puede re-ejecutar sin duplicar.
 */
export default class extends BaseSeeder {
  /** Nombre propio, para que los errores del resolver digan quién falló. */
  private readonly seederName = '0048_consent_evidence_module_seeder'

  /** Slug del módulo: su identidad. Nunca se declara un id. */
  private readonly moduleSlug = 'consent-evidence'

  /** Id del system_setting activo al que se vincula el módulo (para el menú). */
  private readonly activeSettingId = 1

  async run() {
    const systemModuleId = await this.seedModule()
    await this.linkModuleToActiveSetting(systemModuleId)
  }

  private async seedModule(): Promise<number> {
    const groupIdByKey = await resolveSystemModuleGroupIds(['plataforma'], this.seederName)
    return upsertSystemModuleBySlug(
      {
        systemModuleName: 'Evidencia de aceptaciones',
        systemModuleSlug: this.moduleSlug,
        systemModuleDescription:
          'Consulta y export de solo lectura de la evidencia de aceptación de documentos ' +
          'legales (LFPDPPP), reservado al rol root — USRH1783368377327',
        systemModules: '1',
        systemModulePath: '/consent-evidence',
        systemModuleActive: 1,
        systemModuleOrder: 20,
        systemModuleGroupId: groupIdByKey.get('plataforma') ?? null,
        systemModuleIcon:
          '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5l-8-3z" /><path d="m9 12 2 2 4-4" /></svg>',
      },
      this.seederName
    )
  }

  private async linkModuleToActiveSetting(systemModuleId: number) {
    await SystemSettingSystemModule.firstOrCreate(
      { systemSettingId: this.activeSettingId, systemModuleId },
      { systemSettingId: this.activeSettingId, systemModuleId }
    )
  }
}
