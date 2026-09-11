import db from '@adonisjs/lucid/services/db'
import PlatformTenantGroup from '#models/platform_tenant_group'
import { PLATFORM_TENANT_GROUP_ERROR_CODES } from '../constants/platform_tenant_group_error_codes.js'
import { PlatformTenantGroupServiceError } from '../exceptions/platform_tenant_group_service_error.js'

const TITULO_NOMBRE_GRUPO_YA_REGISTRADO = 'No fue posible crear el grupo de tenants'

// ─── Tipos de retorno ─────────────────────────────────────────────────────────

export interface TenantGroupMemberItem {
  businessUnitPublicId: string
  businessUnitName: string
}

export interface TenantGroupItem {
  platformTenantGroupId: number
  nombre: string
  activo: boolean
  tenantsCount: number
  tenants: TenantGroupMemberItem[]
}

export interface ListTenantGroupsFilters {
  search?: string
  incluirInactivos?: boolean
  page?: number
  limit?: number
}

export interface ListTenantGroupsResult {
  data: TenantGroupItem[]
  meta: { total: number; page: number; limit: number; lastPage: number }
}

export interface DeleteTenantGroupResult {
  platformTenantGroupId: number
  tenantsLiberados: number
}

export default class PlatformTenantGroupService {
  /**
   * Normaliza un nombre para comparar unicidad: recorta espacios y mayúsculas.
   */
  private normalizarNombre(nombre: string): string {
    return nombre.trim().toUpperCase()
  }

  /**
   * Busca un grupo vivo con el mismo nombre normalizado.
   */
  private async existeNombreVivo(nombre: string, excluirId?: number): Promise<boolean> {
    const normalizado = this.normalizarNombre(nombre)
    const fila = await db
      .from('platform_tenant_groups')
      .whereNull('platform_tenant_group_deleted_at')
      .whereRaw('UPPER(TRIM(platform_tenant_group_name)) = ?', [normalizado])
      .if(excluirId !== undefined, (q) =>
        q.whereNot('platform_tenant_group_id', excluirId as number)
      )
      .select('platform_tenant_group_id')
      .first()
    return fila !== null
  }

  /**
   * Listado paginado de grupos vivos, ordenados por nombre ascendente.
   * Los inactivos se excluyen salvo `incluirInactivos=true`.
   * Los dados de baja nunca aparecen. Los integrantes con baja lógica no se listan ni se cuentan.
   */
  async listGroups(filters: ListTenantGroupsFilters = {}): Promise<ListTenantGroupsResult> {
    const page = filters.page ?? 1
    const limit = Math.min(filters.limit ?? 20, 100)
    const offset = (page - 1) * limit

    const base = db
      .from('platform_tenant_groups as g')
      .whereNull('g.platform_tenant_group_deleted_at')
      .if(!filters.incluirInactivos, (q) => q.where('g.platform_tenant_group_active', 1))
      .if(filters.search, (q) =>
        q.whereRaw('UPPER(g.platform_tenant_group_name) LIKE ?', [
          `%${(filters.search as string).toUpperCase()}%`,
        ])
      )

    const totalRow = await base
      .clone()
      .count('* as total')
      .first()
      .then((r) => Number((r as { total: string | number } | null)?.total ?? 0))

    const total = totalRow
    const lastPage = Math.max(1, Math.ceil(total / limit))

    const grupos = await base
      .clone()
      .select([
        'g.platform_tenant_group_id as platformTenantGroupId',
        'g.platform_tenant_group_name as nombre',
        'g.platform_tenant_group_active as activo',
      ])
      .orderBy('g.platform_tenant_group_name', 'asc')
      .limit(limit)
      .offset(offset)

    const ids = (grupos as Array<{ platformTenantGroupId: number }>).map(
      (g) => g.platformTenantGroupId
    )

    // Integrantes en una sola consulta (sin N+1), solo cuentas vivas.
    let miembrosPorGrupo: Record<number, TenantGroupMemberItem[]> = {}
    if (ids.length > 0) {
      const miembros = await db
        .from('platform_tenant_group_members as m')
        .join('business_units as bu', 'bu.business_unit_id', 'm.business_unit_id')
        .whereIn('m.platform_tenant_group_id', ids)
        .whereNull('bu.business_unit_deleted_at')
        .select([
          'm.platform_tenant_group_id as groupId',
          'bu.business_unit_public_id as businessUnitPublicId',
          'bu.business_unit_name as businessUnitName',
        ])
        .orderBy('bu.business_unit_name', 'asc')

      for (const m of miembros as Array<{
        groupId: number
        businessUnitPublicId: string
        businessUnitName: string
      }>) {
        ;(miembrosPorGrupo[m.groupId] ??= []).push({
          businessUnitPublicId: m.businessUnitPublicId,
          businessUnitName: m.businessUnitName,
        })
      }
    }

    const data: TenantGroupItem[] = (
      grupos as Array<{ platformTenantGroupId: number; nombre: string; activo: number }>
    ).map((g) => {
      const tenants = miembrosPorGrupo[g.platformTenantGroupId] ?? []
      return {
        platformTenantGroupId: g.platformTenantGroupId,
        nombre: g.nombre,
        activo: Number(g.activo) === 1,
        tenantsCount: tenants.length,
        tenants,
      }
    })

    return { data, meta: { total, page, limit, lastPage } }
  }

  /**
   * Da de alta un grupo activo con cero cuentas.
   * @throws {PlatformTenantGroupServiceError} NAME_TAKEN si el nombre ya lo usa un grupo vivo.
   */
  async createGroup(nombre: string): Promise<TenantGroupItem> {
    if (await this.existeNombreVivo(nombre)) {
      throw new PlatformTenantGroupServiceError(
        'Nombre de grupo ya registrado',
        PLATFORM_TENANT_GROUP_ERROR_CODES.NAME_TAKEN,
        422,
        'nombre-de-grupo-ya-registrado',
        'Ya existe un grupo de tenants registrado con ese nombre.',
        TITULO_NOMBRE_GRUPO_YA_REGISTRADO
      )
    }

    try {
      const grupo = await PlatformTenantGroup.create({
        platformTenantGroupName: nombre.trim(),
        platformTenantGroupActive: 1,
      })
      return {
        platformTenantGroupId: grupo.platformTenantGroupId,
        nombre: grupo.platformTenantGroupName,
        activo: true,
        tenantsCount: 0,
        tenants: [],
      }
    } catch (error) {
      const err = error as { code?: string }
      // La comparación del servicio y el collation de MySQL pueden diferir: el índice manda.
      if (err?.code === 'ER_DUP_ENTRY') {
        throw new PlatformTenantGroupServiceError(
          'Nombre de grupo ya registrado',
          PLATFORM_TENANT_GROUP_ERROR_CODES.NAME_TAKEN,
          422,
          'nombre-de-grupo-ya-registrado',
          'Ya existe un grupo de tenants registrado con ese nombre.',
          TITULO_NOMBRE_GRUPO_YA_REGISTRADO
        )
      }
      throw error
    }
  }

  /**
   * Renombra y/o cambia la vigencia de un grupo vivo, conservando sus integrantes.
   * @throws {PlatformTenantGroupServiceError} NOT_FOUND si no existe o tiene baja lógica.
   * @throws {PlatformTenantGroupServiceError} VAL_INPUT si no llega ningún campo.
   * @throws {PlatformTenantGroupServiceError} NAME_TAKEN si el nuevo nombre choca con otro vivo.
   */
  async updateGroup(
    id: number,
    cambios: { nombre?: string; activo?: boolean }
  ): Promise<TenantGroupItem> {
    if (cambios.nombre === undefined && cambios.activo === undefined) {
      throw new PlatformTenantGroupServiceError(
        'Sin cambios para aplicar',
        PLATFORM_TENANT_GROUP_ERROR_CODES.VAL_INPUT,
        422,
        'datos-invalidos',
        'Indica al menos el nombre o la vigencia para actualizar el grupo.'
      )
    }

    const grupo = await PlatformTenantGroup.query()
      .where('platformTenantGroupId', id)
      .whereNull('deletedAt')
      .first()

    if (!grupo) {
      throw new PlatformTenantGroupServiceError(
        `Grupo ${id} no encontrado`,
        PLATFORM_TENANT_GROUP_ERROR_CODES.NOT_FOUND,
        404,
        'grupo-no-encontrado',
        'El grupo de tenants solicitado no existe o no está disponible.'
      )
    }

    if (cambios.nombre !== undefined) {
      if (await this.existeNombreVivo(cambios.nombre, id)) {
        throw new PlatformTenantGroupServiceError(
          'Nombre de grupo ya registrado',
          PLATFORM_TENANT_GROUP_ERROR_CODES.NAME_TAKEN,
          422,
          'nombre-de-grupo-ya-registrado',
          'Ya existe un grupo de tenants registrado con ese nombre.',
          TITULO_NOMBRE_GRUPO_YA_REGISTRADO
        )
      }
      grupo.platformTenantGroupName = cambios.nombre.trim()
    }

    if (cambios.activo !== undefined) {
      grupo.platformTenantGroupActive = cambios.activo ? 1 : 0
    }

    try {
      await grupo.save()
    } catch (error) {
      const err = error as { code?: string }
      if (err?.code === 'ER_DUP_ENTRY') {
        throw new PlatformTenantGroupServiceError(
          'Nombre de grupo ya registrado',
          PLATFORM_TENANT_GROUP_ERROR_CODES.NAME_TAKEN,
          422,
          'nombre-de-grupo-ya-registrado',
          'Ya existe un grupo de tenants registrado con ese nombre.',
          TITULO_NOMBRE_GRUPO_YA_REGISTRADO
        )
      }
      throw error
    }

    return this.obtenerGrupoConIntegrantes(grupo.platformTenantGroupId)
  }

  /**
   * Da de baja lógica un grupo y libera a sus cuentas en la misma transacción.
   * @throws {PlatformTenantGroupServiceError} NOT_FOUND si no existe o ya tiene baja lógica.
   */
  async deleteGroup(id: number): Promise<DeleteTenantGroupResult> {
    const grupo = await PlatformTenantGroup.query()
      .where('platformTenantGroupId', id)
      .whereNull('deletedAt')
      .first()

    if (!grupo) {
      throw new PlatformTenantGroupServiceError(
        `Grupo ${id} no encontrado`,
        PLATFORM_TENANT_GROUP_ERROR_CODES.NOT_FOUND,
        404,
        'grupo-no-encontrado',
        'El grupo de tenants solicitado no existe o no está disponible.'
      )
    }

    const trx = await db.transaction()
    try {
      const conteo = await trx
        .from('platform_tenant_group_members')
        .where('platform_tenant_group_id', id)
        .count('* as total')
        .first()
        .then((r) => Number((r as { total: string | number } | null)?.total ?? 0))

      await trx.from('platform_tenant_group_members').where('platform_tenant_group_id', id).delete()
      grupo.useTransaction(trx)
      await grupo.delete()
      await trx.commit()

      return { platformTenantGroupId: id, tenantsLiberados: conteo }
    } catch (error) {
      await trx.rollback()
      throw error
    }
  }

  /**
   * Arma el DTO de un grupo vivo con sus integrantes vivos (sin N+1 interno: un solo grupo).
   */
  private async obtenerGrupoConIntegrantes(id: number): Promise<TenantGroupItem> {
    const grupo = await db
      .from('platform_tenant_groups as g')
      .whereNull('g.platform_tenant_group_deleted_at')
      .where('g.platform_tenant_group_id', id)
      .select([
        'g.platform_tenant_group_id as platformTenantGroupId',
        'g.platform_tenant_group_name as nombre',
        'g.platform_tenant_group_active as activo',
      ])
      .first()

    const fila = grupo as { platformTenantGroupId: number; nombre: string; activo: number } | null

    if (!fila) {
      throw new PlatformTenantGroupServiceError(
        `Grupo ${id} no encontrado`,
        PLATFORM_TENANT_GROUP_ERROR_CODES.NOT_FOUND,
        404,
        'grupo-no-encontrado',
        'El grupo de tenants solicitado no existe o no está disponible.'
      )
    }

    const miembros = await db
      .from('platform_tenant_group_members as m')
      .join('business_units as bu', 'bu.business_unit_id', 'm.business_unit_id')
      .where('m.platform_tenant_group_id', id)
      .whereNull('bu.business_unit_deleted_at')
      .select([
        'bu.business_unit_public_id as businessUnitPublicId',
        'bu.business_unit_name as businessUnitName',
      ])
      .orderBy('bu.business_unit_name', 'asc')

    const tenants = (miembros as Array<TenantGroupMemberItem>).map((m) => ({
      businessUnitPublicId: m.businessUnitPublicId,
      businessUnitName: m.businessUnitName,
    }))

    return {
      platformTenantGroupId: fila.platformTenantGroupId,
      nombre: fila.nombre,
      activo: Number(fila.activo) === 1,
      tenantsCount: tenants.length,
      tenants,
    }
  }
}
