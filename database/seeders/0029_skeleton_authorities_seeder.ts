import RegulatoryAuthority from '#models/regulatory_authority'
import { BaseSeeder } from '@adonisjs/lucid/seeders'

/** Semilla idempotente: 7 autoridades reguladoras esqueleto (sin NOM activa todavía). */
export default class extends BaseSeeder {
  async run() {
    const authorities = [
      {
        slug: 'imss',
        shortName: 'IMSS',
        fullName: 'Instituto Mexicano del Seguro Social',
        website: 'https://www.imss.gob.mx',
        brandColor: '#00539B',
        icon: 'imss',
      },
      {
        slug: 'infonavit',
        shortName: 'INFONAVIT',
        fullName: 'Instituto del Fondo Nacional de la Vivienda para los Trabajadores',
        website: 'https://www.infonavit.org.mx',
        brandColor: '#E4002B',
        icon: 'infonavit',
      },
      {
        slug: 'repse',
        shortName: 'REPSE',
        fullName: 'Registro de Prestadoras de Servicios Especializados u Obras Especializadas',
        website: 'https://repse.stps.gob.mx',
        brandColor: '#6D2077',
        icon: 'repse',
      },
      {
        slug: 'jfca',
        shortName: 'JFCA',
        fullName: 'Junta Federal de Conciliación y Arbitraje',
        website: 'https://www.gob.mx/jfca',
        brandColor: '#1D3D6E',
        icon: 'jfca',
      },
      {
        slug: 'sat',
        shortName: 'SAT',
        fullName: 'Servicio de Administración Tributaria',
        website: 'https://www.sat.gob.mx',
        brandColor: '#C8102E',
        icon: 'sat',
      },
      {
        slug: 'inai',
        shortName: 'INAI',
        fullName: 'Instituto Nacional de Transparencia, Acceso a la Información y Protección de Datos Personales',
        website: 'https://home.inai.org.mx',
        brandColor: '#005EB8',
        icon: 'inai',
      },
      {
        slug: 'consar',
        shortName: 'CONSAR',
        fullName: 'Comisión Nacional del Sistema de Ahorro para el Retiro',
        website: 'https://www.gob.mx/consar',
        brandColor: '#00703C',
        icon: 'consar',
      },
    ]

    for (const authority of authorities) {
      await RegulatoryAuthority.updateOrCreate(
        { regulatoryAuthoritySlug: authority.slug },
        {
          regulatoryAuthorityShortName: authority.shortName,
          regulatoryAuthorityFullName: authority.fullName,
          regulatoryAuthorityCountryCode: 'MX',
          regulatoryAuthorityJurisdiction: 'federal',
          regulatoryAuthorityDescriptionKey: `regulatory.authorities.${authority.slug}.description`,
          regulatoryAuthorityAuditDescriptionKey: `regulatory.authorities.${authority.slug}.audit_description`,
          regulatoryAuthorityWebsite: authority.website,
          regulatoryAuthorityBrandColor: authority.brandColor,
          regulatoryAuthorityIcon: authority.icon,
          regulatoryAuthorityIsActive: 1,
        }
      )
    }
  }
}
