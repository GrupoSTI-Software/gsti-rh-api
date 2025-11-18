import SystemSettingsEmployee from '#models/system_settings_employee'
import SystemSetting from '#models/system_setting'

export default class SystemSettingsEmployeeService {
  /**
   * Helper method to check if a record is active
   * @param record - SystemSettingsEmployee record
   * @returns boolean
   */
  private isRecordActive(record: SystemSettingsEmployee): boolean {
    const isActive = record.isActive as any
    return isActive === true || isActive === 1 || isActive === '1'
  }
  /**
   * Crear un nuevo registro de límite de empleados para una configuración del sistema
   * @param systemSettingId - ID de la configuración del sistema
   * @param employeeLimit - Límite de empleados (opcional)
   * @returns Promise<SystemSettingsEmployee>
   */
  async create(systemSettingId: number, employeeLimit?: number): Promise<SystemSettingsEmployee> {
    // Verificar que existe la configuración del sistema
    const systemSetting = await SystemSetting.query()
      .whereNull('system_setting_deleted_at')
      .where('system_setting_id', systemSettingId)
      .first()

    if (!systemSetting) {
      throw new Error('La configuración del sistema no fue encontrada')
    }

    // Buscar registros existentes para esta configuración
    const existingRecords = await SystemSettingsEmployee.query()
      .whereNull('system_setting_employee_deleted_at')
      .where('system_setting_id', systemSettingId)

    // Si hay registros existentes, desactivar el que esté activo
    if (existingRecords.length > 0) {
      const activeRecord = existingRecords.find(record => this.isRecordActive(record))
      if (activeRecord) {
        activeRecord.isActive = false
        await activeRecord.save()
      }
    }

    // Crear nuevo registro
    const newRecord = await SystemSettingsEmployee.create({
      systemSettingId: systemSettingId,
      employeeLimit: employeeLimit || undefined,
      isActive: true,
    })

    return newRecord
  }

  /**
   * Eliminar (desactivar) el límite de empleados para una configuración del sistema
   * @param systemSettingId - ID de la configuración del sistema
   * @returns Promise<SystemSettingsEmployee>
   */
  async delete(systemSettingId: number): Promise<SystemSettingsEmployee> {
    // Verificar que existe la configuración del sistema
    const systemSetting = await SystemSetting.query()
      .whereNull('system_setting_deleted_at')
      .where('system_setting_id', systemSettingId)
      .first()

    if (!systemSetting) {
      throw new Error('La configuración del sistema no fue encontrada')
    }

    // Buscar registros existentes para esta configuración
    const existingRecords = await SystemSettingsEmployee.query()
      .whereNull('system_setting_employee_deleted_at')
      .where('system_setting_id', systemSettingId)

    // Si hay registros existentes, desactivar el que esté activo
    if (existingRecords.length > 0) {
      const activeRecord = existingRecords.find(record => this.isRecordActive(record))
      if (activeRecord) {
        activeRecord.isActive = false
        await activeRecord.save()
      }
    }

    // Crear nuevo registro con employeeLimit undefined (sin límite)
    const newRecord = await SystemSettingsEmployee.create({
      systemSettingId: systemSettingId,
      employeeLimit: undefined,
      isActive: true,
    })

    return newRecord
  }

  /**
   * Leer todos los registros de límite de empleados para una configuración del sistema
   * @param systemSettingId - ID de la configuración del sistema
   * @returns Promise<SystemSettingsEmployee[]>
   */
  async read(systemSettingId: number): Promise<SystemSettingsEmployee[]> {
    // Verificar que existe la configuración del sistema
    const systemSetting = await SystemSetting.query()
      .whereNull('system_setting_deleted_at')
      .where('system_setting_id', systemSettingId)
      .first()

    if (!systemSetting) {
      throw new Error('La configuración del sistema no fue encontrada')
    }

    // Obtener todos los registros para esta configuración
    const records = await SystemSettingsEmployee.query()
      .whereNull('system_setting_employee_deleted_at')
      .where('system_setting_id', systemSettingId)
      .orderBy('system_setting_employee_created_at', 'desc')

    return records
  }

  /**
   * Obtener el registro activo de límite de empleados para una configuración del sistema
   * @param systemSettingId - ID de la configuración del sistema
   * @returns Promise<SystemSettingsEmployee | null>
   */
  async getActive(systemSettingId: number): Promise<SystemSettingsEmployee | null> {
    // Verificar que existe la configuración del sistema
    const systemSetting = await SystemSetting.query()
      .whereNull('system_setting_deleted_at')
      .where('system_setting_id', systemSettingId)
      .first()

    if (!systemSetting) {
      throw new Error('La configuración del sistema no fue encontrada')
    }

    // Obtener el registro activo
    const activeRecord = await SystemSettingsEmployee.query()
      .whereNull('system_setting_employee_deleted_at')
      .where('system_setting_id', systemSettingId)
      .where('isActive', 1)
      .first()

    return activeRecord
  }
}
