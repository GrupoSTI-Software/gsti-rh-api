import env from '#start/env'
import logger from '@adonisjs/core/services/logger'
import BusinessUnit from '#models/business_unit'
import ContratoServicioEspecializado from '#models/contrato_servicio_especializado'
import EmpresaContratante from '#models/empresa_contratante'
import RepseRegistration from '#models/repse_registration'
import { CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES } from '../constants/contrato_servicio_especializado_error_codes.js'
import { EMPRESA_CONTRATANTE_ERROR_CODES } from '../constants/empresa_contratante_error_codes.js'
import { REPSE_ERROR_CODES } from '../constants/repse_registration_error_codes.js'
import { ContratoServicioEspecializadoError } from '../exceptions/contrato_servicio_especializado_error.js'
import { EmpresaContratanteError } from '../exceptions/empresa_contratante_error.js'
import { RepseRegistrationError } from '../exceptions/repse_registration_error.js'

/**
 * Helpers reutilizables para aplicar el aislamiento multi-tenant del módulo
 * REPSE. Encapsulan la resolución de los `business_unit_id` permitidos por
 * el tenant actual (vía `SYSTEM_BUSINESS`) y la verificación de que un
 * registro REPSE pertenezca a dicho tenant.
 *
 * Se extraen del servicio padre para que las historias siguientes de la
 * cadena (catálogo de servicios especializados, contratos B2B, asignación
 * de empleados) compartan exactamente la misma regla sin duplicar código.
 */

/**
 * Devuelve los IDs de unidades de negocio activas a las que el usuario
 * autenticado puede llegar, según los slugs declarados en `SYSTEM_BUSINESS`.
 */
export async function getAllowedBusinessUnitIds(): Promise<number[]> {
  const businessConf = `${env.get('SYSTEM_BUSINESS') ?? ''}`
  const businessSlugs = businessConf
    .split(',')
    .map((slug) => slug.trim())
    .filter((slug) => slug.length > 0)

  if (businessSlugs.length === 0) {
    return []
  }

  const businessUnits = await BusinessUnit.query()
    .whereNull('business_unit_deleted_at')
    .where('business_unit_active', 1)
    .whereIn('business_unit_slug', businessSlugs)
    .select('business_unit_id')

  return businessUnits.map((bu) => bu.businessUnitId)
}

/**
 * Valida que el `businessUnitId` pertenezca al tenant del usuario autenticado.
 * Lanza 404 con key `empresa-no-encontrada` cuando no coincide.
 */
export async function assertBusinessUnitInTenant(businessUnitId: number): Promise<void> {
  const allowed = await getAllowedBusinessUnitIds()
  if (!allowed.includes(businessUnitId)) {
    throw new RepseRegistrationError(
      'La empresa no existe o no pertenece al tenant actual.',
      REPSE_ERROR_CODES.BUSINESS_UNIT_NOT_FOUND,
      404,
      'empresa-no-encontrada'
    )
  }
}

/**
 * Recupera un registro REPSE no borrado lógicamente cuya empresa pertenezca
 * al tenant actual. Lanza 404 cuando no existe o vive en otra empresa.
 *
 * El parámetro `notFoundKey` permite que cada módulo cliente devuelva la key
 * kebab-case que su contrato público requiere. El servicio padre conserva
 * la key histórica `repse-no-encontrado`; los módulos hijos del catálogo
 * REPSE usan `registro-repse-no-encontrado`.
 */
export async function findRegistrationInTenantOrFail(
  repseRegistrationId: number,
  notFoundKey: string = 'repse-no-encontrado'
): Promise<RepseRegistration> {
  const allowed = await getAllowedBusinessUnitIds()
  if (allowed.length === 0) {
    throw new RepseRegistrationError(
      'El registro REPSE no existe o no pertenece al tenant actual.',
      REPSE_ERROR_CODES.REPSE_NOT_FOUND,
      404,
      notFoundKey
    )
  }

  const row = await RepseRegistration.query()
    .where('repse_registration_id', repseRegistrationId)
    .whereNull('repse_registration_deleted_at')
    .whereIn('business_unit_id', allowed)
    .first()

  if (!row) {
    throw new RepseRegistrationError(
      'El registro REPSE no existe o no pertenece al tenant actual.',
      REPSE_ERROR_CODES.REPSE_NOT_FOUND,
      404,
      notFoundKey
    )
  }
  return row
}

/**
 * Recupera una empresa contratante no borrada cuya BU pertenezca al tenant
 * actual. Lanza 404 cuando no existe o vive en otra instancia (cross-tenant).
 */
export async function findEmpresaContratanteInTenantOrFail(
  empresaContratanteId: number,
  notFoundKey: string = 'empresa-contratante-no-encontrada'
): Promise<EmpresaContratante> {
  const allowed = await getAllowedBusinessUnitIds()
  if (allowed.length === 0) {
    throw new EmpresaContratanteError(
      'La empresa contratante no existe o no pertenece al tenant actual.',
      EMPRESA_CONTRATANTE_ERROR_CODES.NOT_FOUND,
      404,
      notFoundKey,
      'La empresa contratante no existe o no pertenece al tenant actual.'
    )
  }

  const row = await EmpresaContratante.query()
    .where('empresa_contratante_id', empresaContratanteId)
    .whereNull('empresa_contratante_deleted_at')
    .whereIn('business_unit_id', allowed)
    .first()

  if (!row) {
    throw new EmpresaContratanteError(
      'La empresa contratante no existe o no pertenece al tenant actual.',
      EMPRESA_CONTRATANTE_ERROR_CODES.NOT_FOUND,
      404,
      notFoundKey,
      'La empresa contratante no existe o no pertenece al tenant actual.'
    )
  }

  return row
}

/**
 * Recupera un contrato de servicios especializados no borrado cuya BU pertenezca
 * al tenant actual. Lanza 404 cuando no existe o vive en otra instancia.
 */
export async function findContratoInTenantOrFail(
  contratoServicioEspecializadoId: number,
  notFoundKey: string = 'contrato-no-encontrado'
): Promise<ContratoServicioEspecializado> {
  const allowed = await getAllowedBusinessUnitIds()
  if (allowed.length === 0) {
    throw new ContratoServicioEspecializadoError(
      'El contrato no existe o no pertenece al tenant actual.',
      CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.NOT_FOUND,
      404,
      notFoundKey,
      'El contrato no existe o no pertenece al tenant actual.'
    )
  }

  const row = await ContratoServicioEspecializado.query()
    .where('contrato_servicio_especializado_id', contratoServicioEspecializadoId)
    .whereNull('contrato_servicio_especializado_deleted_at')
    .whereIn('business_unit_id', allowed)
    .first()

  if (!row) {
    throw new ContratoServicioEspecializadoError(
      'El contrato no existe o no pertenece al tenant actual.',
      CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.NOT_FOUND,
      404,
      notFoundKey,
      'El contrato no existe o no pertenece al tenant actual.'
    )
  }

  return row
}

/**
 * Obtiene el folio REPSE activo del tenant (persona moral/física prestadora).
 * Busca en todas las BUs permitidas; un prestador tiene un solo folio REPSE.
 */
export async function findActiveRepseFolioForTenant(): Promise<string> {
  const allowed = await getAllowedBusinessUnitIds()
  if (allowed.length === 0) {
    throw new ContratoServicioEspecializadoError(
      'No hay registro REPSE activo para el tenant actual.',
      CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.REPSE_NOT_FOUND,
      422,
      'registro-repse-no-encontrado',
      'No hay registro REPSE activo para el tenant actual.'
    )
  }

  const registrations = await RepseRegistration.query()
    .whereNull('repse_registration_deleted_at')
    .where('repse_registration_status', 'active')
    .whereIn('business_unit_id', allowed)
    .orderBy('repse_registration_id', 'asc')

  if (registrations.length === 0) {
    throw new ContratoServicioEspecializadoError(
      'No hay registro REPSE activo para el tenant actual.',
      CONTRATO_SERVICIO_ESPECIALIZADO_ERROR_CODES.REPSE_NOT_FOUND,
      422,
      'registro-repse-no-encontrado',
      'No hay registro REPSE activo para el tenant actual.'
    )
  }

  const folios = [...new Set(registrations.map((r) => r.folio.trim()))]
  if (folios.length > 1) {
    logger.warn(
      { foliosCount: folios.length },
      'Inconsistencia: múltiples folios REPSE activos en el tenant; se usa el primero.'
    )
  }

  return registrations[0].folio.trim()
}
