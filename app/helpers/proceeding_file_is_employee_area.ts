import db from '@adonisjs/lucid/services/db'

const EMPLOYEE_AREA = 'employee'

/**
 * Indica si el tipo de proceeding file pertenece al área de colaboradores.
 * Usado por la regla de superficie compartida del PermissionGate (Expediente).
 */
export async function proceedingFileTypeIsEmployeeArea(
  proceedingFileTypeId: number
): Promise<boolean> {
  if (!Number.isInteger(proceedingFileTypeId) || proceedingFileTypeId <= 0) {
    return false
  }
  const row = await db
    .from('proceeding_file_types')
    .whereNull('proceeding_file_type_deleted_at')
    .where('proceeding_file_type_id', proceedingFileTypeId)
    .where('proceeding_file_type_area_to_use', EMPLOYEE_AREA)
    .first()
  return Boolean(row)
}

/**
 * Indica si el proceeding file pertenece al área de colaboradores (vía su tipo).
 */
export async function proceedingFileIsEmployeeArea(proceedingFileId: number): Promise<boolean> {
  if (!Number.isInteger(proceedingFileId) || proceedingFileId <= 0) {
    return false
  }
  const row = await db
    .from('proceeding_files')
    .innerJoin(
      'proceeding_file_types',
      'proceeding_files.proceeding_file_type_id',
      'proceeding_file_types.proceeding_file_type_id'
    )
    .whereNull('proceeding_files.proceeding_file_deleted_at')
    .whereNull('proceeding_file_types.proceeding_file_type_deleted_at')
    .where('proceeding_files.proceeding_file_id', proceedingFileId)
    .where('proceeding_file_types.proceeding_file_type_area_to_use', EMPLOYEE_AREA)
    .first()
  return Boolean(row)
}

/**
 * Indica si el valor de propiedad pertenece a un documento del área de colaboradores.
 */
export async function proceedingFileTypePropertyValueIsEmployeeArea(
  proceedingFileTypePropertyValueId: number
): Promise<boolean> {
  if (
    !Number.isInteger(proceedingFileTypePropertyValueId) ||
    proceedingFileTypePropertyValueId <= 0
  ) {
    return false
  }
  const row = await db
    .from('proceeding_file_type_property_values as v')
    .innerJoin('proceeding_files as f', 'v.proceeding_file_id', 'f.proceeding_file_id')
    .innerJoin(
      'proceeding_file_types as t',
      'f.proceeding_file_type_id',
      't.proceeding_file_type_id'
    )
    .whereNull('v.proceeding_file_type_property_value_deleted_at')
    .whereNull('f.proceeding_file_deleted_at')
    .whereNull('t.proceeding_file_type_deleted_at')
    .where('v.proceeding_file_type_property_value_id', proceedingFileTypePropertyValueId)
    .where('t.proceeding_file_type_area_to_use', EMPLOYEE_AREA)
    .first()
  return Boolean(row)
}
