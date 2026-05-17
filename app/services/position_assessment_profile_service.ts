import PositionAssessmentProfile from '#models/position_assessment_profile'
import { PositionAssessmentProfileFilterSearchInterface } from '../interfaces/position_assessment_profile_filter_search_interface.js'

/**
 * Servicio que administra los perfiles de evaluación asociados a los puestos
 * (`PositionAssessmentProfile`). Cada perfil define los rangos `mínimo` y
 * `máximo` aceptables para una dimensión específica de una plantilla de
 * evaluación, lo que permite calcular automáticamente el estado de los
 * resultados de evaluaciones psicométricas aplicadas a empleados que ocupan
 * dicho puesto.
 *
 * Toda eliminación se realiza mediante soft delete (`deleted_at`).
 */
export default class PositionAssessmentProfileService {

  /**
   * Devuelve un listado paginado de perfiles de evaluación de puestos
   * aplicando filtros opcionales:
   * - `positionId`: filtra por puesto exacto.
   * - `assessmentTemplateDimensionId`: filtra por dimensión exacta.
   * - `assessmentTemplateId`: filtra a través de la relación
   *   `assessmentTemplateDimension` (perfiles de cualquier dimensión que
   *   pertenezca a esa plantilla).
   *
   * Precarga las relaciones `assessmentTemplateDimension` y `position`,
   * ordenando por fecha de creación descendente.
   *
   * @param filters Filtros de búsqueda y paginación.
   * @returns Resultado paginado de Lucid con los perfiles encontrados.
   */
  async index(filters: PositionAssessmentProfileFilterSearchInterface) {
    const items = await PositionAssessmentProfile.query()
      .whereNull('position_assessment_profile_deleted_at')
      .if(filters.positionId, (query) => {
        query.where('position_id', filters.positionId!)
      })
      .if(filters.assessmentTemplateDimensionId, (query) => {
        query.where('assessment_template_dimension_id', filters.assessmentTemplateDimensionId!)
      })
      .if(filters.assessmentTemplateId, (query) => {
        query.whereHas('assessmentTemplateDimension', (dimensionQuery) => {
          dimensionQuery.where('assessment_template_id', filters.assessmentTemplateId!)
        })
      })
      .preload('assessmentTemplateDimension')
      .preload('position')
      .orderBy('position_assessment_profile_created_at', 'desc')
      .paginate(filters.page, filters.limit)

    return items
  }

  /**
   * Crea un nuevo perfil de evaluación de puesto. Solo copia los campos
   * relevantes del DTO recibido (positionId, assessmentTemplateDimensionId,
   * mínimo y máximo) para evitar inyección de columnas no permitidas.
   *
   * @param profile DTO con los datos a persistir.
   * @returns El perfil recién creado.
   */
  async create(profile: PositionAssessmentProfile) {
    const newProfile = new PositionAssessmentProfile()
    newProfile.positionId = profile.positionId
    newProfile.assessmentTemplateDimensionId = profile.assessmentTemplateDimensionId
    newProfile.positionAssessmentProfileMinimumValue =
      profile.positionAssessmentProfileMinimumValue
    newProfile.positionAssessmentProfileMaximumValue =
      profile.positionAssessmentProfileMaximumValue
    await newProfile.save()
    return newProfile
  }

  /**
   * Actualiza únicamente los rangos mínimo y máximo de un perfil existente.
   * El puesto y la dimensión asociados no se modifican mediante este método.
   *
   * @param currentProfile Instancia actual del perfil.
   * @param profile DTO con los nuevos valores de mínimo/máximo.
   * @returns El perfil actualizado.
   */
  async update(
    currentProfile: PositionAssessmentProfile,
    profile: PositionAssessmentProfile
  ) {
    currentProfile.positionAssessmentProfileMinimumValue =
      profile.positionAssessmentProfileMinimumValue
    currentProfile.positionAssessmentProfileMaximumValue =
      profile.positionAssessmentProfileMaximumValue
    await currentProfile.save()
    return currentProfile
  }

  /**
   * Realiza un soft delete sobre el perfil de evaluación.
   *
   * @param currentProfile Instancia a eliminar lógicamente.
   * @returns La misma instancia ya marcada como eliminada.
   */
  async delete(currentProfile: PositionAssessmentProfile) {
    await currentProfile.delete()
    return currentProfile
  }

  /**
   * Obtiene un perfil por su identificador con `assessmentTemplateDimension`
   * y `position` precargadas.
   *
   * @param positionAssessmentProfileId Identificador del perfil.
   * @returns El perfil encontrado o `null` si no existe / fue eliminado.
   */
  async show(positionAssessmentProfileId: number) {
    const profile = await PositionAssessmentProfile.query()
      .whereNull('position_assessment_profile_deleted_at')
      .where('position_assessment_profile_id', positionAssessmentProfileId)
      .preload('assessmentTemplateDimension')
      .preload('position')
      .first()
    return profile ?? null
  }

  /**
   * Devuelve todos los perfiles activos de un puesto, ordenados por fecha de
   * creación ascendente, precargando la dimensión asociada.
   *
   * @param positionId Identificador del puesto.
   * @returns Lista de perfiles del puesto (puede ser vacía).
   */
  async getByPositionId(positionId: number) {
    return await PositionAssessmentProfile.query()
      .whereNull('position_assessment_profile_deleted_at')
      .where('position_id', positionId)
      .preload('assessmentTemplateDimension')
      .orderBy('position_assessment_profile_created_at', 'asc')
  }
}
