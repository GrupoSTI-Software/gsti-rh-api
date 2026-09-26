import RegulatoryAuthority from '#models/regulatory_authority'
import { BaseSeeder } from '@adonisjs/lucid/seeders'

/** Semilla idempotente: autoridad STPS (Secretaría del Trabajo y Previsión Social). */
export default class extends BaseSeeder {
  async run() {
    await RegulatoryAuthority.updateOrCreate(
      { regulatoryAuthoritySlug: 'stps' },
      {
        regulatoryAuthorityShortName: 'STPS',
        regulatoryAuthorityFullName: 'Secretaría del Trabajo y Previsión Social',
        regulatoryAuthorityCountryCode: 'MX',
        regulatoryAuthorityJurisdiction: 'federal',
        regulatoryAuthorityDescriptionKey: 'regulatory.authorities.stps.description',
        regulatoryAuthorityAuditDescriptionKey: 'regulatory.authorities.stps.audit_description',
        regulatoryAuthorityWebsite: 'https://www.gob.mx/stps',
        regulatoryAuthorityBrandColor: '#C8102E',
        regulatoryAuthorityIcon: 'stps',
        regulatoryAuthorityIsActive: 1,
      }
    )
  }
}
