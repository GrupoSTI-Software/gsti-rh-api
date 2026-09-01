import SystemSettingTradeName from '#models/system_setting_trade_name'
import SystemSetting from '#models/system_setting'
import { TenantContext } from '#utils/tenant_context'
import { DateTime } from 'luxon'

export default class SystemSettingTradeNameService {
  /**
   * Consulta acotada a las razones sociales de la empresa activa.
   *
   * Ni `SystemSettingTradeName` ni `SystemSetting` componen el mixin de
   * empresa, asi que ninguna consulta hereda el filtro por si sola. Como el
   * `systemSettingId` llega del cliente, sin este candado bastaba con cambiarlo
   * para leer o modificar la configuracion —y el branding— de otra empresa.
   *
   * Se incluyen las filas con `business_unit_id` nulo: son la configuracion
   * global del sistema, visible para todos.
   */
  private scopedQuery() {
    const query = SystemSettingTradeName.query().whereNull('system_setting_deleted_at')

    if (!TenantContext.isActive() || TenantContext.isBypassed()) {
      return query
    }

    const scope = TenantContext.getScope()

    return query.whereIn(
      'system_setting_id',
      SystemSetting.query()
        .select('system_setting_id')
        .where((subQuery) => {
          subQuery.whereIn('business_unit_id', scope).orWhereNull('business_unit_id')
        })
    )
  }

  async index(systemSettingId: number) {
    const rows = await this.scopedQuery()
      .where('system_setting_id', systemSettingId)
      .orderBy('system_setting_trade_name_id')
    return { data: rows }
  }

  async create(payload: SystemSettingTradeName) {
    const row = new SystemSettingTradeName()
    row.systemSettingId = payload.systemSettingId
    row.systemSettingTradeName = payload.systemSettingTradeName
    row.systemSettingSidebarColor = payload.systemSettingSidebarColor
    row.systemSettingLogo = payload.systemSettingLogo ?? null
    row.systemSettingBanner = payload.systemSettingBanner ?? null
    row.systemSettingFavicon = payload.systemSettingFavicon ?? null
    row.systemSettingEmployeeAplicationIcon = payload.systemSettingEmployeeAplicationIcon ?? null
    row.systemSettingCreatedAt = DateTime.now()
    await row.save()
    return row
  }

  async update(
    current: SystemSettingTradeName,
    payload: SystemSettingTradeName
  ) {
    current.systemSettingTradeName = payload.systemSettingTradeName
    current.systemSettingSidebarColor = payload.systemSettingSidebarColor
    current.systemSettingLogo = payload.systemSettingLogo ?? null
    current.systemSettingBanner = payload.systemSettingBanner ?? null
    current.systemSettingFavicon = payload.systemSettingFavicon ?? null
    current.systemSettingEmployeeAplicationIcon =
      payload.systemSettingEmployeeAplicationIcon ?? null
    await current.save()
    return current
  }

  async delete(current: SystemSettingTradeName) {
    await current.delete()
    return current
  }

  async show(systemSettingTradeNameId: number) {
    return await this.scopedQuery()
      .where('system_setting_trade_name_id', systemSettingTradeNameId)
      .first()
  }

  async verifyInfo(row: SystemSettingTradeName) {
    const action = row.systemSettingTradeNameId ? 'updated' : 'created'
    const query = SystemSettingTradeName.query()
      .whereNull('system_setting_deleted_at')
      .where('system_setting_id', row.systemSettingId)
      .where('system_trade_name', row.systemSettingTradeName)

    if (row.systemSettingTradeNameId) {
      query.whereNot('system_setting_trade_name_id', row.systemSettingTradeNameId)
    }

    const exist = await query.first()

    if (exist) {
      return {
        status: 400,
        type: 'warning',
        title: 'La razón social ya existe',
        message: `No se puede ${action === 'created' ? 'crear' : 'actualizar'} el registro porque la razón social ya está asignada a otra fila de este system setting`,
        data: { ...row },
      }
    }

    return {
      status: 200,
      type: 'success',
      title: 'Verificación correcta',
      message: 'Verificación correcta',
      data: { ...row },
    }
  }
}
