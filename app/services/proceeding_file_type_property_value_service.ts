import Employee from '#models/employee'
import EmployeeProceedingFile from '#models/employee_proceeding_file'
import ProceedingFileTypeProperty from '#models/proceeding_file_type_property'
import ProceedingFileTypePropertyValue from '#models/proceeding_file_type_property_value'
import SystemSettingProceedingFile from '#models/system_setting_proceeding_file'
import SystemSetting from '#models/system_setting'
import { TenantContext } from '#utils/tenant_context'

export default class ProceedingFileTypePropertyValueService {
  /**
   * `create()` delega el dueño al `@beforeCreate` del modelo (regla 4). Si
   * el empleado o la unidad activa no resuelven, el hook lanza (mensaje con
   * "no está en tu alcance") — se atrapa aquí y se devuelve `null` en vez de
   * propagar la excepción, espejo de `EmployeeProceedingFileService.create`
   * (USRH1783372659486), para que el controller la traduzca a 404 + log sin
   * que el texto interno llegue al cliente (regla 5, R-1).
   */
  async create(proceedingFileTypePropertyValue: ProceedingFileTypePropertyValue) {
    const newProceedingFileTypePropertyValue = new ProceedingFileTypePropertyValue()
    newProceedingFileTypePropertyValue.proceedingFileTypePropertyId =
      proceedingFileTypePropertyValue.proceedingFileTypePropertyId
    newProceedingFileTypePropertyValue.employeeId =
      proceedingFileTypePropertyValue.employeeId ?? null
    newProceedingFileTypePropertyValue.proceedingFileId =
      proceedingFileTypePropertyValue.proceedingFileId
    newProceedingFileTypePropertyValue.proceedingFileTypePropertyValueValue =
      proceedingFileTypePropertyValue.proceedingFileTypePropertyValueValue
    newProceedingFileTypePropertyValue.proceedingFileTypePropertyValueActive =
      proceedingFileTypePropertyValue.proceedingFileTypePropertyValueActive
    try {
      await newProceedingFileTypePropertyValue.save()
    } catch {
      return null
    }
    return newProceedingFileTypePropertyValue
  }

  async update(
    currentProceedingFileTypePropertyValue: ProceedingFileTypePropertyValue,
    proceedingFileTypePropertyValue: ProceedingFileTypePropertyValue
  ) {
    currentProceedingFileTypePropertyValue.proceedingFileTypePropertyValueValue =
      proceedingFileTypePropertyValue.proceedingFileTypePropertyValueValue
    currentProceedingFileTypePropertyValue.proceedingFileTypePropertyValueActive =
      proceedingFileTypePropertyValue.proceedingFileTypePropertyValueActive
    await currentProceedingFileTypePropertyValue.save()
    return currentProceedingFileTypePropertyValue
  }

  async delete(currentProceedingFileTypePropertyValue: ProceedingFileTypePropertyValue) {
    await currentProceedingFileTypePropertyValue.delete()
    return currentProceedingFileTypePropertyValue
  }

  async show(proceedingFileTypePropertyValueId: number) {
    const proceedingFileTypePropertyValue = await ProceedingFileTypePropertyValue.query()
      .whereNull('proceeding_file_type_property_value_deleted_at')
      .where('proceeding_file_type_property_value_id', proceedingFileTypePropertyValueId)
      .first()
    return proceedingFileTypePropertyValue ? proceedingFileTypePropertyValue : null
  }

  /**
   * Verifica existencia (comportamiento legacy, sin cambios) y, además,
   * pertenencia a la unidad activa del `employeeId` y del `proceedingFileId`
   * (regla 7, CA-6, USRH1786595131481). Cuando la pertenencia falla, el
   * retorno lleva `scopeDenied: true` para que el controller lo traduzca al
   * 404 uniforme (regla 5) en vez del 400 legacy — no basta con la
   * existencia, hay que confirmar de quién es.
   */
  async verifyInfoExist(proceedingFileTypePropertyValue: ProceedingFileTypePropertyValue) {
    const existProceedingFileTypeProperty = await ProceedingFileTypeProperty.query()
      .whereNull('proceeding_file_type_property_deleted_at')
      .where(
        'proceeding_file_type_property_id',
        proceedingFileTypePropertyValue.proceedingFileTypePropertyId
      )
      .first()

    if (
      !existProceedingFileTypeProperty &&
      proceedingFileTypePropertyValue.proceedingFileTypePropertyId
    ) {
      return {
        status: 400,
        type: 'warning',
        title: 'The proceeding file type property was not found',
        message: 'The proceeding file type property was not found with the entered ID',
        data: { ...proceedingFileTypePropertyValue },
      }
    }

    if (proceedingFileTypePropertyValue.employeeId) {
      // Employee ya está acotado por su propio withBusinessUnitScope: un
      // employeeId ajeno resuelve null aquí, igual que uno inexistente.
      const existEmployee = await Employee.query()
        .whereNull('employee_deleted_at')
        .where('employee_id', proceedingFileTypePropertyValue.employeeId)
        .first()

      if (!existEmployee) {
        return {
          status: 404,
          scopeDenied: true,
          requestedId: proceedingFileTypePropertyValue.employeeId,
          data: { ...proceedingFileTypePropertyValue },
        }
      }
    }

    if (proceedingFileTypePropertyValue.proceedingFileId) {
      const belongsToActiveScope = await this.proceedingFileBelongsToActiveScope(
        proceedingFileTypePropertyValue.proceedingFileId
      )
      if (!belongsToActiveScope) {
        return {
          status: 404,
          scopeDenied: true,
          requestedId: proceedingFileTypePropertyValue.proceedingFileId,
          data: { ...proceedingFileTypePropertyValue },
        }
      }
    }

    return {
      status: 200,
      type: 'success',
      title: 'Info verifiy successfully',
      message: 'Info verify successfully',
      data: { ...proceedingFileTypePropertyValue },
    }
  }

  /**
   * `ProceedingFile` no tiene mixin propio (@tenant-scope pendiente), así
   * que la existencia por sí sola no basta (fail-open). Se resuelve la
   * pertenencia por los dos caminos posibles: (a) vía `EmployeeProceedingFile`
   * (sí tiene mixin — un expediente de empleado ajeno no resuelve) y, si no
   * cuelga de un empleado, (b) vía `SystemSettingProceedingFile` →
   * `SystemSetting.businessUnitId`, comparado explícitamente contra el scope
   * activo (ninguno de los dos modelos del puente (b) tiene mixin).
   */
  private async proceedingFileBelongsToActiveScope(proceedingFileId: number): Promise<boolean> {
    const viaEmployee = await EmployeeProceedingFile.query()
      .whereNull('employee_proceeding_file_deleted_at')
      .where('proceedingFileId', proceedingFileId)
      .first()
    if (viaEmployee) return true

    const viaSystemSetting = await SystemSettingProceedingFile.query()
      .whereNull('system_setting_proceeding_file_deleted_at')
      .where('proceedingFileId', proceedingFileId)
      .first()
    if (!viaSystemSetting) return false

    const systemSetting = await SystemSetting.query()
      .where('systemSettingId', viaSystemSetting.systemSettingId)
      .first()
    if (!systemSetting || systemSetting.businessUnitId === null) return false

    return TenantContext.getScope().includes(systemSetting.businessUnitId)
  }
}
