import db from '@adonisjs/lucid/services/db'
import PlatformTenantGroup from '#models/platform_tenant_group'
import { PLATFORM_TENANT_GROUP_ERROR_CODES } from '../constants/platform_tenant_group_error_codes.js'
import { PlatformTenantGroupServiceError } from '../exceptions/platform_tenant_group_service_error.js'

const TITULO_NOMBRE_GRUPO_YA_REGISTRADO = 'No fue posible crear el grupo de tenants'
const TITULO_ASIGNACION_MIEMBROS = 'No fue posible asignar las cuentas al grupo'

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

/** Cuenta que sale de un grupo anterior para entrar al grupo destino (regla 3). */
export interface TenantGroupMovedItem {
  businessUnitPublicId: string
  grupoAnteriorId: number
  grupoAnteriorNombre: string
}

/** Resultado del reemplazo de conjunto de miembros de un grupo. */
export interface ReplaceTenantGroupMembersResult {
  platformTenantGroupId: number
  /** Miembros que quedaron en el grupo tras el reemplazo. */
  asignados: number
  /** Miembros vivos que salieron del grupo y quedaron sueltos. */
  liberados: number
  /** Cuentas que se movieron desde otro grupo vivo, con su procedencia. */
  movidos: TenantGroupMovedItem[]
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

  /**
   * Reemplaza el conjunto completo de miembros de un grupo en una sola transacción.
   *
   * Semántica (regla 1): lo que llega es exactamente lo que queda. Los miembros vivos
   * que no vengan en la lista salen del grupo; cada cuenta de la lista que pertenezca a
   * otro grupo se mueve (regla 3), y la respuesta declara de dónde salió en `movidos`.
   * Una lista vacía vacía el grupo y es válida (regla 6).
   *
   * El vaciado alcanza solo a los miembros cuya cuenta está viva: la membresía de una
   * cuenta con baja lógica no se toca, porque el operador nunca la vio en el selector y
   * no pudo conservarla. Así la cuenta vuelve a su grupo si la restauran (regla 10 + CA-11).
   *
   * @param id - Identificador del grupo destino.
   * @param businessUnitPublicIds - Conjunto completo de cuentas, sin duplicados (lo garantiza Vine).
   * @returns Conteos de asignados y liberados, y el detalle de los movimientos.
   * @throws {PlatformTenantGroupServiceError} NOT_FOUND 404 si el grupo no existe o tiene baja lógica.
   * @throws {PlatformTenantGroupServiceError} INACTIVE_NOT_ASSIGNABLE 422 si el grupo está apagado.
   * @throws {PlatformTenantGroupServiceError} TENANT_NOT_FOUND 422 si alguna cuenta no existe o tiene baja lógica.
   * @throws {PlatformTenantGroupServiceError} VAL_INPUT 422 si el índice único choca por concurrencia.
   */
  async replaceMembers(
    id: number,
    businessUnitPublicIds: string[]
  ): Promise<ReplaceTenantGroupMembersResult> {
    // ── 1. Grupo vivo y vigente ───────────────────────────────────────────────
    const grupoRow = await db
      .from('platform_tenant_groups')
      .where('platform_tenant_group_id', id)
      .whereNull('platform_tenant_group_deleted_at')
      .select([
        'platform_tenant_group_id as platformTenantGroupId',
        'platform_tenant_group_active as activo',
      ])
      .first()

    const grupo = grupoRow as { platformTenantGroupId: number; activo: number } | null

    if (!grupo) {
      throw new PlatformTenantGroupServiceError(
        `Grupo ${id} no encontrado`,
        PLATFORM_TENANT_GROUP_ERROR_CODES.NOT_FOUND,
        404,
        'grupo-no-encontrado',
        'El grupo de tenants solicitado no existe o no está disponible.'
      )
    }

    // Regla 7: un grupo apagado conserva sus miembros pero no admite asignaciones.
    if (Number(grupo.activo) !== 1) {
      throw new PlatformTenantGroupServiceError(
        `Grupo ${id} inactivo`,
        PLATFORM_TENANT_GROUP_ERROR_CODES.INACTIVE_NOT_ASSIGNABLE,
        422,
        'grupo-inactivo-no-admite-tenants',
        'El grupo está desactivado y no admite asignaciones nuevas. Reactívalo para asignarle cuentas.',
        TITULO_ASIGNACION_MIEMBROS
      )
    }

    // ── 2. Resolver uuid a id interno, solo cuentas vivas (regla 10) ──────────
    let filas: Array<{ buId: number; publicId: string }> = []
    if (businessUnitPublicIds.length > 0) {
      const encontradas = await db
        .from('business_units')
        .whereIn('business_unit_public_id', businessUnitPublicIds)
        .whereNull('business_unit_deleted_at')
        .select(['business_unit_id as buId', 'business_unit_public_id as publicId'])
      filas = encontradas as Array<{ buId: number; publicId: string }>
    }

    // ── 3. Todo o nada con el ofensor nombrado (regla 5), antes de la transacción
    const encontrados = new Set(filas.map((f) => f.publicId))
    const ofensor = businessUnitPublicIds.find((publicId) => !encontrados.has(publicId))
    if (ofensor !== undefined) {
      throw new PlatformTenantGroupServiceError(
        `Cuenta ${ofensor} no encontrada`,
        PLATFORM_TENANT_GROUP_ERROR_CODES.TENANT_NOT_FOUND,
        422,
        'tenant-no-encontrado',
        `La cuenta ${ofensor} no existe o está dada de baja. No se guardó ningún cambio del grupo.`,
        TITULO_ASIGNACION_MIEMBROS
      )
    }

    const buIds = filas.map((f) => f.buId)
    const publicIdPorBuId = new Map<number, string>(filas.map((f) => [f.buId, f.publicId]))

    // ── 4. Procedencia de los que se mueven, para declararla en la respuesta ──
    // Solo grupos vivos: un vínculo cuyo grupo tenga baja lógica no es procedencia visible.
    let movidos: TenantGroupMovedItem[] = []
    if (buIds.length > 0) {
      const previas = await db
        .from('platform_tenant_group_members as m')
        .join(
          'platform_tenant_groups as g',
          'g.platform_tenant_group_id',
          'm.platform_tenant_group_id'
        )
        .whereIn('m.business_unit_id', buIds)
        .whereNot('m.platform_tenant_group_id', id)
        .whereNull('g.platform_tenant_group_deleted_at')
        .select([
          'm.business_unit_id as buId',
          'g.platform_tenant_group_id as grupoAnteriorId',
          'g.platform_tenant_group_name as grupoAnteriorNombre',
        ])

      movidos = (
        previas as Array<{ buId: number; grupoAnteriorId: number; grupoAnteriorNombre: string }>
      ).map((p) => ({
        businessUnitPublicId: publicIdPorBuId.get(Number(p.buId)) as string,
        grupoAnteriorId: Number(p.grupoAnteriorId),
        grupoAnteriorNombre: p.grupoAnteriorNombre,
      }))
    }

    // ── 5. Reemplazo indivisible ──────────────────────────────────────────────
    const trx = await db.transaction()
    try {
      // Miembros vivos actuales del grupo: los únicos que este reemplazo puede liberar.
      const actuales = await trx
        .from('platform_tenant_group_members as m')
        .join('business_units as bu', 'bu.business_unit_id', 'm.business_unit_id')
        .where('m.platform_tenant_group_id', id)
        .whereNull('bu.business_unit_deleted_at')
        .select('m.business_unit_id as buId')

      const actualesIds = (actuales as Array<{ buId: number }>).map((a) => Number(a.buId))
      const entrantes = new Set(buIds)
      const liberados = actualesIds.filter((buId) => !entrantes.has(buId)).length

      // Vacía el grupo sin tocar membresías de cuentas con baja lógica.
      if (actualesIds.length > 0) {
        await trx
          .from('platform_tenant_group_members')
          .where('platform_tenant_group_id', id)
          .whereIn('business_unit_id', actualesIds)
          .delete()
      }

      if (buIds.length > 0) {
        // Saca a los entrantes de cualquier otro grupo: esto es "mover" (regla 3).
        // La unicidad no se programa dos veces: se borra y se crea, el índice manda.
        await trx.from('platform_tenant_group_members').whereIn('business_unit_id', buIds).delete()

        await trx.table('platform_tenant_group_members').multiInsert(
          buIds.map((buId) => ({
            platform_tenant_group_id: id,
            business_unit_id: buId,
          }))
        )
      }

      await trx.commit()

      return { platformTenantGroupId: id, asignados: buIds.length, liberados, movidos }
    } catch (error) {
      await trx.rollback()
      const err = error as { code?: string }
      // Dos operadores guardando la misma cuenta a la vez: una gana, la otra recibe
      // un error controlado. Nunca un 500 sin traducir.
      if (err?.code === 'ER_DUP_ENTRY') {
        throw new PlatformTenantGroupServiceError(
          'Colisión de membresía por concurrencia',
          PLATFORM_TENANT_GROUP_ERROR_CODES.VAL_INPUT,
          422,
          'datos-invalidos',
          'Otra operación acaba de asignar una de estas cuentas a un grupo. Vuelve a cargar el listado e inténtalo de nuevo.',
          TITULO_ASIGNACION_MIEMBROS
        )
      }
      throw error
    }
  }
}
