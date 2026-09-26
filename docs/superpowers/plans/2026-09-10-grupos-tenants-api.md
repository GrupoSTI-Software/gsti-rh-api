# Grupos de Tenants API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear el modelo y CRUD de grupos económicos de tenants en el área de plataforma, sin UI.

**Architecture:** Espejar el molde vigente del área `platform` (migración + columna generada, modelos Lucid, servicio con DTO manual, controlador con doble documentación, validador Vine, catálogo de errores). Dos tablas nuevas (`platform_tenant_groups` y pivote `platform_tenant_group_members`) y API de cuatro endpoints bajo guard de administrador de plataforma.

**Tech Stack:** AdonisJS 6 + Lucid (MySQL), Vine, TypeScript estricto (cero `any`), SoftDeletes (`adonis-lucid-soft-deletes`).

## Global Constraints

- Todo el código, comentarios y documentación en español, excepto nombres de variables, funciones, clases y métodos (en inglés), palabras reservadas y nombres de librerías.
- NUNCA usar `await` con `this.schema` dentro de `up()`/`down()`; llamar `this.schema.alterTable(...)` / `this.schema.raw(...)` sin `await`.
- No modificar `node_modules/`; solo lectura o regeneración vía package manager.
- No modificar `app/models/business_unit.ts` bajo ninguna circunstancia.
- Ningún modelo Lucid se serializa: prohibido `.serialize()`, `.toJSON()` y `{ ...modelo }`; armar respuestas campo por campo con casteo explícito.
- Nunca publicar `business_unit_id` interno; la clave externa es siempre `businessUnitPublicId` (UUID); sin RFC, perfil fiscal, correo de facturación ni `billingSubscriptionId`.
- Las consultas crudas filtran `platform_tenant_group_deleted_at IS NULL` y `business_unit_deleted_at IS NULL` a mano y explícito (el hook de `SoftDeletes` no aplica).
- `key` en kebab español y `code` punteado `PLT.GRP.*` son campos distintos; la rama de validación Vine emite `key: datos-invalidos`.
- TypeScript estricto, cero `any`; interfaces de retorno exportadas arriba del servicio.
- Guard a nivel de grupo `[middleware.auth({ guards: ['api'] }), middleware.platformAdmin()]`, nunca ruta por ruta; sin rate limiter.
- FK del pivote con `integer().unsigned()`, nunca `bigInteger` (rompe la FK en MySQL contra `increments`).
- Sin seeder; sin pantalla; sin endpoint de miembros (`PUT :id/members` es de la historia USRH1788055613533).

---

### Task 1: Migraciones de grupos y pertenencias

**Files:**
- Create: `database/migrations/1788282413067000_create_platform_tenant_groups_table.ts`
- Create: `database/migrations/1788282413067001_create_platform_tenant_group_members_table.ts`

**Interfaces:**
- Consumes: nada (primera tarea).
- Produces: tablas `platform_tenant_groups` (con columna generada `platform_tenant_group_name_active` + índice `platform_tenant_groups_name_active_unique`) y `platform_tenant_group_members` (con `UNIQUE(business_unit_id)` + FKs `RESTRICT`).

- [ ] **Step 1: Verificar el siguiente prefijo disponible**

```bash
ls database/migrations | sort -n | tail -n 5
```

- [ ] **Step 2: Crear la migración M1 de grupos**

```typescript
import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Grupos económicos de tenants (USRH1788052455657).
 * Tabla global sin `business_unit_id` ni mixin de scope: el grupo es dato de GSTI, no de tenant.
 * La unicidad del nombre entre grupos vivos vive en columna generada + UNIQUE, nunca UNIQUE plano.
 */
export default class extends BaseSchema {
  protected tableName = 'platform_tenant_groups'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('platform_tenant_group_id').notNullable()
      table.string('platform_tenant_group_name', 150).notNullable()
      table.tinyint('platform_tenant_group_active').notNullable().defaultTo(1)
      table.timestamp('platform_tenant_group_created_at').notNullable().defaultTo(this.now())
      table.timestamp('platform_tenant_group_updated_at').nullable()
      table.timestamp('platform_tenant_group_deleted_at').nullable().defaultTo(null)
    })

    // Columna generada VIRTUAL: nombre real en vivos, NULL en dados de baja.
    this.schema.raw(`
      ALTER TABLE \`platform_tenant_groups\`
      ADD COLUMN \`platform_tenant_group_name_active\` VARCHAR(150)
        GENERATED ALWAYS AS (
          CASE WHEN \`platform_tenant_group_deleted_at\` IS NULL
               THEN \`platform_tenant_group_name\` ELSE NULL END
        ) VIRTUAL
    `)

    // Cada NULL se considera distinto: las bajas no compiten por el nombre (regla 3).
    this.schema.raw(`
      ALTER TABLE \`platform_tenant_groups\`
      ADD UNIQUE KEY \`platform_tenant_groups_name_active_unique\` (\`platform_tenant_group_name_active\`)
    `)
  }

  async down() {
    // Tolerante a estado parcial: verifica information_schema antes de cada DROP.
    this.defer(async (db) => {
      type CountRow = { cnt: number }
      const [idxRows] = await db.rawQuery<[CountRow[]]>(
        `SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS
         WHERE table_schema = DATABASE()
           AND table_name = 'platform_tenant_groups'
           AND index_name = 'platform_tenant_groups_name_active_unique'`
      )
      if ((idxRows[0]?.cnt ?? 0) > 0) {
        await db.rawQuery(
          'ALTER TABLE `platform_tenant_groups` DROP INDEX `platform_tenant_groups_name_active_unique`'
        )
      }
      const [colRows] = await db.rawQuery<[CountRow[]]>(
        `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
         WHERE table_schema = DATABASE()
           AND table_name = 'platform_tenant_groups'
           AND column_name = 'platform_tenant_group_name_active'`
      )
      if ((colRows[0]?.cnt ?? 0) > 0) {
        await db.rawQuery(
          'ALTER TABLE `platform_tenant_groups` DROP COLUMN `platform_tenant_group_name_active`'
        )
      }
    })
    this.schema.dropTableIfExists(this.tableName)
  }
}
```

- [ ] **Step 3: Crear la migración M2 del pivote**

```typescript
import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Pertenencia de una cuenta a un grupo (USRH1788052455657).
 * Una membresía existe o no existe: sin `deleted_at` ni `active`.
 * La regla "una cuenta a lo más un grupo" vive en UNIQUE(business_unit_id), no en el servicio.
 */
export default class extends BaseSchema {
  protected tableName = 'platform_tenant_group_members'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('platform_tenant_group_member_id').notNullable()

      table
        .integer('platform_tenant_group_id')
        .unsigned()
        .notNullable()
        .references('platform_tenant_group_id')
        .inTable('platform_tenant_groups')
        .onDelete('RESTRICT')

      table
        .integer('business_unit_id')
        .unsigned()
        .notNullable()
        .references('business_unit_id')
        .inTable('business_units')
        .onDelete('RESTRICT')

      table.timestamp('platform_tenant_group_member_created_at').notNullable().defaultTo(this.now())
      table.timestamp('platform_tenant_group_member_updated_at').nullable()

      // Regla 4 de la HU en la base de datos.
      table.unique(['business_unit_id'], { indexName: 'uq_platform_tenant_group_member_bu' })
      // Para el listado y el futuro desglose de MRR por grupo.
      table.index(['platform_tenant_group_id'], 'idx_platform_tenant_group_member_group')
    })
  }

  async down() {
    this.schema.dropTableIfExists(this.tableName)
  }
}
```

- [ ] **Step 4: Correr las migraciones y verificar la columna generada**

```bash
node ace migration:run
```

Expected: ambas migraciones aplicadas sin error "Duplicate column name".

- [ ] **Step 5: Verificar en `information_schema` el índice y la columna generada**

```bash
node ace tinker --execute="const db = await import('@adonisjs/lucid/services/db'); const d = db.default; const [c] = await d.rawQuery(\"SELECT COLUMN_NAME, GENERATION_EXPRESSION FROM information_schema.COLUMNS WHERE table_schema = DATABASE() AND table_name = 'platform_tenant_groups' AND column_name = 'platform_tenant_group_name_active'\"); console.log(JSON.stringify(c)); const [i] = await d.rawQuery(\"SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE table_schema = DATABASE() AND table_name = 'platform_tenant_groups' AND index_name = 'platform_tenant_groups_name_active_unique'\"); console.log(JSON.stringify(i)); await d.manager.closeAll()"
```

Expected: una fila de columna con expresión generada y una fila de índice.

- [ ] **Step 6: Verificar el `UNIQUE(business_unit_id)` del pivote con inserción manual**

```bash
mysql -e "INSERT INTO platform_tenant_group_members (platform_tenant_group_id, business_unit_id) VALUES (1, 1); INSERT INTO platform_tenant_group_members (platform_tenant_group_id, business_unit_id) VALUES (1, 1);"
```

Expected: la segunda inserción falla con violación de clave única.

- [ ] **Step 7: Commit**

```bash
git add database/migrations/1788282413067000_create_platform_tenant_groups_table.ts database/migrations/1788282413067001_create_platform_tenant_group_members_table.ts
git commit -m "feat: Agregar tablas de grupos de tenants y pertenencias"
```

### Task 2: Modelos Lucid

**Files:**
- Create: `app/models/platform_tenant_group.ts`
- Create: `app/models/platform_tenant_group_member.ts`

**Interfaces:**
- Consumes: tablas de la Task 1.
- Produces: clases `PlatformTenantGroup` y `PlatformTenantGroupMember` usadas por la Task 5.

- [ ] **Step 1: Crear el modelo de grupo**

```typescript
import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SoftDeletes } from 'adonis-lucid-soft-deletes'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import PlatformTenantGroupMember from './platform_tenant_group_member.js'

/**
 * Grupo económico de tenants (USRH1788052455657).
 * Dato global de GSTI: sin `business_unit_id` ni mixin de scope.
 * La columna generada `platform_tenant_group_name_active` no se declara: es de base de datos.
 */
export default class PlatformTenantGroup extends compose(BaseModel, SoftDeletes) {
  static readonly table = 'platform_tenant_groups'

  @column({ isPrimary: true })
  declare platformTenantGroupId: number

  @column()
  declare platformTenantGroupName: string

  /** Vigencia del grupo: 1 activo, 0 inactivo. Nace activo. */
  @column()
  declare platformTenantGroupActive: number

  @column.dateTime({ autoCreate: true })
  declare platformTenantGroupCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare platformTenantGroupUpdatedAt: DateTime | null

  @column.dateTime({ columnName: 'platform_tenant_group_deleted_at' })
  declare deletedAt: DateTime | null

  @hasMany(() => PlatformTenantGroupMember, {
    foreignKey: 'platformTenantGroupId',
    localKey: 'platformTenantGroupId',
  })
  declare members: HasMany<typeof PlatformTenantGroupMember>
}
```

- [ ] **Step 2: Crear el modelo de pertenencia**

```typescript
import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import PlatformTenantGroup from './platform_tenant_group.js'
import BusinessUnit from './business_unit.js'

/**
 * Pertenencia de una cuenta a un grupo (USRH1788052455657).
 * Sin `SoftDeletes`: la membresía existe o no existe.
 */
export default class PlatformTenantGroupMember extends BaseModel {
  static readonly table = 'platform_tenant_group_members'

  @column({ isPrimary: true })
  declare platformTenantGroupMemberId: number

  @column()
  declare platformTenantGroupId: number

  /** Identificador interno; nunca se expone en respuestas (serializeAs: null). */
  @column({ serializeAs: null })
  declare businessUnitId: number

  @column.dateTime({ autoCreate: true })
  declare platformTenantGroupMemberCreatedAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare platformTenantGroupMemberUpdatedAt: DateTime | null

  @belongsTo(() => PlatformTenantGroup, {
    foreignKey: 'platformTenantGroupId',
    localKey: 'platformTenantGroupId',
  })
  declare group: BelongsTo<typeof PlatformTenantGroup>

  @belongsTo(() => BusinessUnit, {
    foreignKey: 'businessUnitId',
    localKey: 'businessUnitId',
  })
  declare businessUnit: BelongsTo<typeof BusinessUnit>
}
```

- [ ] **Step 3: Verificar tipos**

```bash
node ace typecheck || npx tsc --noEmit
```

Expected: sin errores de tipos.

- [ ] **Step 4: Commit**

```bash
git add app/models/platform_tenant_group.ts app/models/platform_tenant_group_member.ts
git commit -m "feat: Agregar modelos de grupos de tenants y pertenencias"
```

### Task 3: Errores de dominio (catálogo, excepción y resolvedor)

**Files:**
- Create: `app/constants/platform_tenant_group_error_codes.ts`
- Create: `app/exceptions/platform_tenant_group_service_error.ts`
- Create: `app/helpers/platform_tenant_group_api_error.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `PLATFORM_TENANT_GROUP_ERROR_CODES` + tipo `PlatformTenantGroupErrorCode`, clase `PlatformTenantGroupServiceError`, función `resolveTenantGroupApiError(error, fallbackStatus?)`.

- [ ] **Step 1: Crear el catálogo de códigos**

```typescript
/**
 * Códigos estables para el cliente — grupos de tenants de plataforma.
 * Prefijo PLT.GRP = PLaTaforma · GRuPos.
 */
export const PLATFORM_TENANT_GROUP_ERROR_CODES = {
  /** Body/query inválido (Vine) o PUT sin ningún campo */
  VAL_INPUT: 'PLT.GRP.VAL_INPUT',
  /** Grupo no encontrado por id (incluye dados de baja) */
  NOT_FOUND: 'PLT.GRP.NOT_FOUND',
  /** Nombre ya usado por un grupo vivo */
  NAME_TAKEN: 'PLT.GRP.NAME_TAKEN',
  /** Error no tipado del sistema */
  SYS_UNHANDLED: 'PLT.GRP.SYS_UNHANDLED',
} as const

export type PlatformTenantGroupErrorCode =
  (typeof PLATFORM_TENANT_GROUP_ERROR_CODES)[keyof typeof PLATFORM_TENANT_GROUP_ERROR_CODES]
```

- [ ] **Step 2: Crear la excepción de dominio**

```typescript
import type { PlatformTenantGroupErrorCode } from '../constants/platform_tenant_group_error_codes.js'

/**
 * Error de dominio del módulo de grupos de tenants con código HTTP y errorCode estable.
 */
export class PlatformTenantGroupServiceError extends Error {
  readonly errorCode: PlatformTenantGroupErrorCode
  readonly httpStatus: number
  readonly key?: string
  readonly detail?: string

  constructor(
    message: string,
    errorCode: PlatformTenantGroupErrorCode,
    httpStatus: number = 400,
    key?: string,
    detail?: string
  ) {
    super(message)
    this.name = 'PlatformTenantGroupServiceError'
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.key = key
    this.detail = detail
  }
}
```

- [ ] **Step 3: Crear el resolvedor de error de API**

```typescript
import { PLATFORM_TENANT_GROUP_ERROR_CODES } from '../constants/platform_tenant_group_error_codes.js'
import { PlatformTenantGroupServiceError } from '../exceptions/platform_tenant_group_service_error.js'

export type ResolvedTenantGroupError = {
  title: string
  detail: string
  key: string
  code: string
  status: number
}

/**
 * Convierte excepciones del módulo de grupos en la respuesta HTTP estable
 * `{ title, detail, key, code }` con prefijo PLT.GRP.*.
 * El `key` es el slug del título en kebab español, el `code` es el identificador punteado.
 */
export function resolveTenantGroupApiError(
  error: unknown,
  fallbackStatus: number = 500
): ResolvedTenantGroupError {
  const err = error as { code?: string; messages?: Array<{ message?: string }>; message?: string }

  if (err?.code === 'E_VALIDATION_ERROR') {
    const detail = err.messages?.[0]?.message ?? 'Datos inválidos'
    return {
      title: 'Grupos de tenants de plataforma',
      detail,
      key: 'datos-invalidos',
      code: PLATFORM_TENANT_GROUP_ERROR_CODES.VAL_INPUT,
      status: 422,
    }
  }

  if (error instanceof PlatformTenantGroupServiceError) {
    return {
      title: 'Grupos de tenants de plataforma',
      detail: error.detail ?? error.message,
      key: error.key ?? error.errorCode,
      code: error.errorCode,
      status: error.httpStatus,
    }
  }

  return {
    title: 'Error del servidor',
    detail: typeof err?.message === 'string' ? err.message : 'Error inesperado en grupos.',
    key: 'error-inesperado',
    code: PLATFORM_TENANT_GROUP_ERROR_CODES.SYS_UNHANDLED,
    status: fallbackStatus,
  }
}
```

- [ ] **Step 4: Verificar tipos**

```bash
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add app/constants/platform_tenant_group_error_codes.ts app/exceptions/platform_tenant_group_service_error.ts app/helpers/platform_tenant_group_api_error.ts
git commit -m "feat: Agregar errores de dominio de grupos de tenants"
```

### Task 4: Validadores Vine

**Files:**
- Create: `app/validators/platform_tenant_group.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `createTenantGroupValidator`, `updateTenantGroupValidator`, `listTenantGroupsValidator` usados por la Task 6 vía `request.validateUsing(...)`.

- [ ] **Step 1: Crear los validadores**

```typescript
import vine from '@vinejs/vine'

/**
 * Body para `POST /api/platform/tenant-groups`.
 * La unicidad la valida el servicio, no Vine.
 */
export const createTenantGroupValidator = vine.compile(
  vine.object({
    nombre: vine.string().trim().minLength(2).maxLength(150),
  })
)

/**
 * Body para `PUT /api/platform/tenant-groups/:platformTenantGroupId`.
 * Al menos uno de los dos campos; el servicio rechaza el cuerpo vacío con VAL_INPUT.
 */
export const updateTenantGroupValidator = vine.compile(
  vine.object({
    nombre: vine.string().trim().minLength(2).maxLength(150).optional(),
    activo: vine.boolean().optional(),
  })
)

/**
 * Query params para `GET /api/platform/tenant-groups`.
 */
export const listTenantGroupsValidator = vine.compile(
  vine.object({
    search: vine.string().trim().minLength(1).maxLength(150).optional(),
    incluirInactivos: vine.boolean().optional(),
    page: vine.number().positive().withoutDecimals().optional(),
    limit: vine.number().positive().withoutDecimals().max(100).optional(),
  })
)
```

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add app/validators/platform_tenant_group.ts
git commit -m "feat: Agregar validadores de grupos de tenants"
```

### Task 5: Servicio con CRUD y lectura de integrantes

**Files:**
- Create: `app/services/platform_tenant_group_service.ts`

**Interfaces:**
- Consumes: `PlatformTenantGroup`, `PlatformTenantGroupMember` (Task 2), `PLATFORM_TENANT_GROUP_ERROR_CODES` y `PlatformTenantGroupServiceError` (Task 3).
- Produces: `TenantGroupMemberItem`, `TenantGroupItem`, `ListTenantGroupsFilters`, `ListTenantGroupsResult`, `DeleteTenantGroupResult` y clase `PlatformTenantGroupService` con métodos `listGroups`, `createGroup`, `updateGroup`, `deleteGroup` usados por la Task 6.

- [ ] **Step 1: Crear las interfaces y el esqueleto del servicio**

```typescript
import db from '@adonisjs/lucid/services/db'
import PlatformTenantGroup from '#models/platform_tenant_group'
import { PLATFORM_TENANT_GROUP_ERROR_CODES } from '../constants/platform_tenant_group_error_codes.js'
import { PlatformTenantGroupServiceError } from '../exceptions/platform_tenant_group_service_error.js'

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
```

- [ ] **Step 2: Implementar el servicio completo**

```typescript
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

    const data: TenantGroupItem[] = (grupos as Array<{ platformTenantGroupId: number; nombre: string; activo: number }>)
      .map((g) => {
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
        'Ya existe un grupo de tenants registrado con ese nombre.'
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
          'Ya existe un grupo de tenants registrado con ese nombre.'
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
          'Ya existe un grupo de tenants registrado con ese nombre.'
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
          'Ya existe un grupo de tenants registrado con ese nombre.'
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
```

- [ ] **Step 3: Verificar tipos**

```bash
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add app/services/platform_tenant_group_service.ts
git commit -m "feat: Agregar servicio CRUD de grupos de tenants"
```

### Task 6: Controlador, rutas y registro

**Files:**
- Create: `app/controllers/platform_tenant_group_controller.ts`
- Create: `start/routes/platform_tenant_group_routes.ts`
- Modify: `start/routes.ts:15-25` (agregar import en el bloque de plataforma)

**Interfaces:**
- Consumes: `PlatformTenantGroupService`, `TenantGroupItem` (Task 5); validadores (Task 4); `resolveTenantGroupApiError` (Task 3).
- Produces: endpoints `GET /`, `POST /`, `PUT /:platformTenantGroupId`, `DELETE /:platformTenantGroupId` bajo `/api/platform/tenant-groups`.

- [ ] **Step 1: Crear el controlador**

```typescript
import type { HttpContext } from '@adonisjs/core/http'
import PlatformTenantGroupService from '#services/platform_tenant_group_service'
import {
  createTenantGroupValidator,
  listTenantGroupsValidator,
  updateTenantGroupValidator,
} from '#validators/platform_tenant_group'
import { resolveTenantGroupApiError } from '../helpers/platform_tenant_group_api_error.js'

/**
 * Grupos económicos de tenants en la consola de plataforma GSTI (USRH1788052455657).
 * Alta, listado, cambio de nombre/vigencia y baja lógica con liberación de cuentas.
 */
export default class PlatformTenantGroupController {
  private readonly service = new PlatformTenantGroupService()

  /**
   * @swagger
   * /api/platform/tenant-groups:
   *   get:
   *     tags:
   *       - Platform · TenantGroups
   *     summary: Listado de grupos de tenants con sus cuentas
   *     description: |
   *       Devuelve los grupos vivos ordenados por nombre ascendente, cada uno con
   *       su vigencia, su conteo de cuentas y sus integrantes.
   *       Los inactivos se excluyen salvo incluirInactivos=true. Los dados de baja nunca aparecen.
   *       Las cuentas con baja lógica no se listan ni se cuentan, aunque su pertenencia siga registrada.
   *       Requiere sesión válida y is_platform_admin = 1.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: search
   *         required: false
   *         schema:
   *           type: string
   *           minLength: 1
   *           maxLength: 150
   *         description: Filtro sobre el nombre del grupo
   *       - in: query
   *         name: incluirInactivos
   *         required: false
   *         schema:
   *           type: boolean
   *           default: false
   *       - in: query
   *         name: page
   *         required: false
   *         schema:
   *           type: integer
   *           minimum: 1
   *           default: 1
   *       - in: query
   *         name: limit
   *         required: false
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 100
   *           default: 20
   *     responses:
   *       '200':
   *         description: Listado paginado de grupos
   *       '422':
   *         description: Parámetros de consulta inválidos
   *       '403':
   *         description: Sin permisos de administrador de plataforma
   *
   * @index
   * @summary Listado de grupos de tenants con sus cuentas
   * @description Devuelve los grupos vivos ordenados por nombre ascendente, cada uno con su vigencia, conteo e integrantes. Requiere sesión válida y marca de administrador de plataforma.
   * @tag Platform · TenantGroups
   * @operationId listPlatformTenantGroups
   * @security [{"bearerAuth": []}]
   * @paramQuery search - Filtro sobre el nombre del grupo - string
   * @paramQuery incluirInactivos - Incluir grupos inactivos (default false) - boolean
   * @paramQuery page - Página (default 1) - integer
   * @paramQuery limit - Resultados por página, máx 100 (default 20) - integer
   * @responseBody 200 - {"type": "success", "data": [{"platformTenantGroupId": 1, "nombre": "Grupo Manny", "activo": true, "tenantsCount": 0, "tenants": []}], "meta": {"total": 1, "page": 1, "limit": 20, "lastPage": 1}}
   * @responseBody 422 - {"title": "string", "detail": "string", "key": "datos-invalidos", "code": "PLT.GRP.VAL_INPUT"}
   * @responseBody 403 - {"title": "string", "detail": "string", "key": "AUTH.PLATFORM.FORBIDDEN"}
   */
  async index({ request, response }: HttpContext) {
    try {
      const { search, incluirInactivos, page, limit } =
        await request.validateUsing(listTenantGroupsValidator)
      const result = await this.service.listGroups({
        search,
        incluirInactivos: incluirInactivos ?? false,
        page: page ?? 1,
        limit: limit ?? 20,
      })
      return response.status(200).json({ type: 'success', ...result })
    } catch (error) {
      const { status: httpStatus, ...body } = resolveTenantGroupApiError(error)
      return response.status(httpStatus).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/tenant-groups:
   *   post:
   *     tags:
   *       - Platform · TenantGroups
   *     summary: Dar de alta un grupo de tenants
   *     description: |
   *       Crea un grupo activo con cero cuentas. El nombre no se repite entre grupos vivos:
   *       la comparación ignora espacios sobrantes y mayúsculas. Requiere sesión válida y is_platform_admin = 1.
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [nombre]
   *             properties:
   *               nombre:
   *                 type: string
   *                 minLength: 2
   *                 maxLength: 150
   *                 example: Grupo Manny
   *     responses:
   *       '201':
   *         description: Grupo creado
   *       '422':
   *         description: Nombre ya registrado o datos inválidos
   *
   * @store
   * @summary Dar de alta un grupo de tenants
   * @description Crea un grupo activo con cero cuentas. El nombre no se repite entre grupos vivos. Requiere sesión válida y marca de administrador de plataforma.
   * @tag Platform · TenantGroups
   * @operationId createPlatformTenantGroup
   * @security [{"bearerAuth": []}]
   * @requestBody {"nombre": "Grupo Manny"}
   * @responseBody 201 - {"type": "success", "data": {"platformTenantGroupId": 1, "nombre": "Grupo Manny", "activo": true, "tenantsCount": 0, "tenants": []}}
   * @responseBody 422 - {"title": "No fue posible crear el grupo de tenants", "detail": "Ya existe un grupo de tenants registrado con ese nombre.", "key": "nombre-de-grupo-ya-registrado", "code": "PLT.GRP.NAME_TAKEN"}
   */
  async store({ request, response }: HttpContext) {
    try {
      const { nombre } = await request.validateUsing(createTenantGroupValidator)
      const grupo = await this.service.createGroup(nombre)
      return response.status(201).json({ type: 'success', data: grupo })
    } catch (error) {
      const { status: httpStatus, ...body } = resolveTenantGroupApiError(error)
      return response.status(httpStatus).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/tenant-groups/{platformTenantGroupId}:
   *   put:
   *     tags:
   *       - Platform · TenantGroups
   *     summary: Renombrar y/o cambiar la vigencia de un grupo
   *     description: |
   *       Acepta nombre y/o activo; al menos uno es obligatorio.
   *       Desactivar no es dar de baja: el grupo sigue viéndose con sus cuentas.
   *       Requiere sesión válida y is_platform_admin = 1.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: platformTenantGroupId
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               nombre:
   *                 type: string
   *                 minLength: 2
   *                 maxLength: 150
   *               activo:
   *                 type: boolean
   *     responses:
   *       '200':
   *         description: Grupo actualizado
   *       '404':
   *         description: Grupo no encontrado o dado de baja
   *       '422':
   *         description: Datos inválidos o nombre ya registrado
   *
   * @update
   * @summary Renombrar y/o cambiar la vigencia de un grupo
   * @description Acepta nombre y/o activo; al menos uno es obligatorio. Desactivar conserva el grupo y sus cuentas. Requiere sesión válida y marca de administrador de plataforma.
   * @tag Platform · TenantGroups
   * @operationId updatePlatformTenantGroup
   * @security [{"bearerAuth": []}]
   * @paramPath platformTenantGroupId - Identificador del grupo - integer
   * @requestBody {"nombre": "Grupo Manny Corporativo", "activo": false}
   * @responseBody 200 - {"type": "success", "data": {"platformTenantGroupId": 1, "nombre": "Grupo Manny Corporativo", "activo": false, "tenantsCount": 0, "tenants": []}}
   * @responseBody 404 - {"title": "string", "detail": "string", "key": "grupo-no-encontrado", "code": "PLT.GRP.NOT_FOUND"}
   * @responseBody 422 - {"title": "string", "detail": "string", "key": "datos-invalidos", "code": "PLT.GRP.VAL_INPUT"}
   */
  async update({ params, request, response }: HttpContext) {
    try {
      const { nombre, activo } = await request.validateUsing(updateTenantGroupValidator)
      const grupo = await this.service.updateGroup(Number(params.platformTenantGroupId), {
        nombre,
        activo,
      })
      return response.status(200).json({ type: 'success', data: grupo })
    } catch (error) {
      const { status: httpStatus, ...body } = resolveTenantGroupApiError(error)
      return response.status(httpStatus).json(body)
    }
  }

  /**
   * @swagger
   * /api/platform/tenant-groups/{platformTenantGroupId}:
   *   delete:
   *     tags:
   *       - Platform · TenantGroups
   *     summary: Dar de baja lógica un grupo y liberar sus cuentas
   *     description: |
   *       Baja lógica: el grupo deja de existir para el panel y sus cuentas quedan sueltas
   *       conservando toda su información. Ambas cosas ocurren juntas o no ocurre ninguna.
   *       El nombre liberado se puede volver a usar. Requiere sesión válida y is_platform_admin = 1.
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: platformTenantGroupId
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       '200':
   *         description: Grupo dado de baja
   *       '404':
   *         description: Grupo no encontrado o ya dado de baja
   *
   * @destroy
   * @summary Dar de baja lógica un grupo y liberar sus cuentas
   * @description Baja lógica con liberación de cuentas en una sola transacción. El nombre liberado se puede volver a usar. Requiere sesión válida y marca de administrador de plataforma.
   * @tag Platform · TenantGroups
   * @operationId deletePlatformTenantGroup
   * @security [{"bearerAuth": []}]
   * @paramPath platformTenantGroupId - Identificador del grupo - integer
   * @responseBody 200 - {"type": "success", "data": {"platformTenantGroupId": 1, "tenantsLiberados": 0}}
   * @responseBody 404 - {"title": "string", "detail": "string", "key": "grupo-no-encontrado", "code": "PLT.GRP.NOT_FOUND"}
   */
  async destroy({ params, response }: HttpContext) {
    try {
      const resultado = await this.service.deleteGroup(Number(params.platformTenantGroupId))
      return response.status(200).json({ type: 'success', data: resultado })
    } catch (error) {
      const { status: httpStatus, ...body } = resolveTenantGroupApiError(error)
      return response.status(httpStatus).json(body)
    }
  }
}
```

- [ ] **Step 2: Crear el archivo de rutas**

```typescript
import router from '@adonisjs/core/services/router'
import { middleware } from '../kernel.js'

/**
 * ─── Grupos de tenants de plataforma ──────────────────────────────────────────
 *   GET    /api/platform/tenant-groups                        → listado paginado + filtros
 *   POST   /api/platform/tenant-groups                        → alta
 *   PUT    /api/platform/tenant-groups/:platformTenantGroupId → renombrar y/o vigencia
 *   DELETE /api/platform/tenant-groups/:platformTenantGroupId → baja lógica + liberación
 *
 * Todos tras guard platformAdmin (auth + is_platform_admin).
 * Ref: USRH1788052455657.
 */
router
  .group(() => {
    router.get('/', '#controllers/platform_tenant_group_controller.index')
    router.post('/', '#controllers/platform_tenant_group_controller.store')
    router
      .put('/:platformTenantGroupId', '#controllers/platform_tenant_group_controller.update')
      .where('platformTenantGroupId', router.matchers.number())
    router
      .delete('/:platformTenantGroupId', '#controllers/platform_tenant_group_controller.destroy')
      .where('platformTenantGroupId', router.matchers.number())
  })
  .prefix('/api/platform/tenant-groups')
  .use([middleware.auth({ guards: ['api'] }), middleware.platformAdmin()])
```

- [ ] **Step 3: Registrar el import en `start/routes.ts`**

```typescript
import './routes/platform_tenant_group_routes.js'
```

Ubicación: en el bloque de plataforma, después de `import './routes/platform_tenant_routes.js'`.

- [ ] **Step 4: Levantar el servidor y verificar que los endpoints responden (no 404)**

```bash
node ace serve --watch &
sleep 5
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3333/api/platform/tenant-groups -H "Authorization: Bearer SIN_SESION"
```

Expected: `401` (el guard `auth` responde; un `404` significa que falta el import en `start/routes.ts`).

- [ ] **Step 5: Commit**

```bash
git add app/controllers/platform_tenant_group_controller.ts start/routes/platform_tenant_group_routes.ts start/routes.ts
git commit -m "feat: Agregar controlador y rutas de grupos de tenants"
```

### Task 7: Verificación integral de criterios de aceptación

**Files:**
- Test: verificación manual con `curl` + `mysql` (sin `.spec.ts`; el repo no exige specs para esta área).

**Interfaces:**
- Consumes: Tasks 1-6 completas.
- Produces: evidencia de CA-1 a CA-8 y del DoD.

- [ ] **Step 1: Alta correcta (CA-1)**

```bash
curl -s -X POST http://localhost:3333/api/platform/tenant-groups \
  -H "Authorization: Bearer $TOKEN_ADMIN" -H "Content-Type: application/json" \
  -d '{"nombre": "Grupo Manny"}'
```

Expected: `201` con `{ type: 'success', data: { platformTenantGroupId, nombre: "Grupo Manny", activo: true, tenantsCount: 0, tenants: [] } }`.

- [ ] **Step 2: Nombre repetido con espacios y minúsculas (CA-2)**

```bash
curl -s -X POST http://localhost:3333/api/platform/tenant-groups \
  -H "Authorization: Bearer $TOKEN_ADMIN" -H "Content-Type: application/json" \
  -d '{"nombre": "  grupo manny  "}'
```

Expected: `422` con `{ title: "No fue posible crear el grupo de tenants", detail: "Ya existe un grupo de tenants registrado con ese nombre.", key: "nombre-de-grupo-ya-registrado", code: "PLT.GRP.NAME_TAKEN" }` y sin fila nueva en base.

- [ ] **Step 3: Renombrar y desactivar (CA-4)**

```bash
curl -s -X PUT http://localhost:3333/api/platform/tenant-groups/1 \
  -H "Authorization: Bearer $TOKEN_ADMIN" -H "Content-Type: application/json" \
  -d '{"nombre": "Grupo Manny Corporativo", "activo": false}'
```

Expected: `200` con el grupo actualizado, mismos integrantes y `tenantsCount`.

- [ ] **Step 4: PUT vacío (CA-4 error)**

```bash
curl -s -X PUT http://localhost:3333/api/platform/tenant-groups/1 \
  -H "Authorization: Bearer $TOKEN_ADMIN" -H "Content-Type: application/json" \
  -d '{}'
```

Expected: `422` con `key: "datos-invalidos"`, `code: "PLT.GRP.VAL_INPUT"`.

- [ ] **Step 5: Baja lógica y reuso del nombre (CA-3 y CA-5)**

```bash
curl -s -X DELETE http://localhost:3333/api/platform/tenant-groups/1 \
  -H "Authorization: Bearer $TOKEN_ADMIN"
curl -s -X POST http://localhost:3333/api/platform/tenant-groups \
  -H "Authorization: Bearer $TOKEN_ADMIN" -H "Content-Type: application/json" \
  -d '{"nombre": "Grupo Manny"}'
```

Expected: `DELETE` responde `200` con `{ type: 'success', data: { platformTenantGroupId: 1, tenantsLiberados: <n> } }`; el `POST` posterior responde `201` y quedan dos filas (una con `deleted_at` no nulo).

- [ ] **Step 6: Grupo inexistente o dado de baja (CA-6)**

```bash
curl -s -X PUT http://localhost:3333/api/platform/tenant-groups/999999 \
  -H "Authorization: Bearer $TOKEN_ADMIN" -H "Content-Type: application/json" \
  -d '{"nombre": "Otro"}'
curl -s -X DELETE http://localhost:3333/api/platform/tenant-groups/999999 \
  -H "Authorization: Bearer $TOKEN_ADMIN"
```

Expected: ambos `404` con `key: "grupo-no-encontrado"`, `code: "PLT.GRP.NOT_FOUND"`.

- [ ] **Step 7: Listado solo vivos y filtro de inactivos (CA-7)**

```bash
curl -s "http://localhost:3333/api/platform/tenant-groups" -H "Authorization: Bearer $TOKEN_ADMIN"
curl -s "http://localhost:3333/api/platform/tenant-groups?incluirInactivos=true" -H "Authorization: Bearer $TOKEN_ADMIN"
```

Expected: la primera trae solo vivos ordenados por `nombre` con `meta: { total, page, limit, lastPage }`; la segunda incluye además los inactivos; ninguna trae dados de baja.

- [ ] **Step 8: Acceso sin marca de plataforma (CA-8)**

```bash
curl -s http://localhost:3333/api/platform/tenant-groups -H "Authorization: Bearer $TOKEN_SIN_ADMIN"
```

Expected: `403` con `key: 'AUTH.PLATFORM.FORBIDDEN'` emitido por el guard, sin campo `code`.

- [ ] **Step 9: Verificar el diff no toca `business_unit.ts`**

```bash
git diff --name-only | grep -c "app/models/business_unit.ts" || echo "0 toques: correcto"
```

Expected: `0 toques: correcto`.

---

### Task 8: Manual de prueba manual API para quien prueba con cliente HTTP

**Files:**
- Create: `docs/superpowers/plans/2026-09-10-grupos-tenants-api-qa-api.md`

**Interfaces:**
- Consumes: Tasks 1-6 (contrato de los cuatro endpoints, formas de éxito y de error).
- Produces: playbook recorrible por una persona con cliente de API, sin abrir el repo.

- [ ] **Step 1: Escribir el manual QA API completo**

```markdown
# Prueba manual API — Grupos económicos de tenants (alta y administración base)

**Problema:** El panel cuenta cada cuenta técnica como si fuera un cliente distinto. Dos cuentas hermanas que se negocian y se cobran juntas aparecen como dos renglones parejos, así que nadie que mire el tablero puede ver que una tercera parte del ingreso depende de una sola relación comercial.

**Solución:** El sistema ahora guarda la etiqueta comercial que dice qué cuentas son el mismo cliente real. Esta prueba verifica que esa etiqueta se puede crear, renombrar, desactivar y dar de baja, y que el listado la devuelve con su vigencia y sus cuentas.

Ejemplo: es como si en la tienda de la esquina tuvieras dos libretas, una para los refrescos y otra para las botanas, pero las dos fueran del mismo vecino que te paga junto cada quincena. Ahora le pones una liga a las dos libretas con su nombre para saber cuánto te debe en total, sin mezclar las cuentas.

Se prueba con un cliente de API (Postman, Insomnia, Bruno). La autenticación se asume resuelta por tu cliente: se envía el token del usuario en el header `Authorization: Bearer <token>`.

**URL base:** `http://127.0.0.1:3333`

---

**Aviso antes del primer escenario.** La base es compartida: el listado trae también los grupos que dejen otras pruebas. Reconoces los tuyos porque todos empiezan con `QA-GRP-`. Ningún escenario de este manual toca un interruptor global: no hay paso de limpieza.

**Un caso de la historia no se puede provocar aquí.** La historia pide que una cuenta dada de baja no se liste ni se cuente como integrante aunque su pertenencia siga registrada, y que al restaurarse vuelva a su grupo. Dar de baja y restaurar cuentas desde el cliente de API no es parte de esta historia, así que ese comportamiento queda fuera del recorrido. También queda declarado que, hasta que entre la historia de asignación de cuentas, todo grupo creado aquí reporta `tenantsCount: 0` y `tenants: []`: ese es el estado correcto, no un defecto.

## 1. Preparar (una sola vez)

```bash
cd gsti-rh-api
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Deja listos los dos usuarios de esta prueba.

| | Correo | Contraseña | Variante |
|---|---|---|---|
| **A** | `qa-tenant-groups-admin@gsti-tests.local` | `password` | Administrador de plataforma: debe crear, leer y modificar grupos |
| **B** | `qa-tenant-groups-sin-marca@gsti-tests.local` | `password` | Sin el marcador de plataforma: debe recibir `403` |

Los identificadores que van en las rutas no se inventan: resuelve el del grupo que crees con esta consulta (usa el nombre exacto que le diste en cada escenario):

```sql
SELECT platform_tenant_group_id AS id FROM platform_tenant_groups
WHERE platform_tenant_group_name = 'QA-GRP-Manny' AND platform_tenant_group_deleted_at IS NULL;
```

## 2. Escenario 1 — Crear un grupo

Usuario: **A**.

**Endpoint:** `POST /api/platform/tenant-groups`

```json
{ "nombre": "QA-GRP-Manny" }
```

**Response — 201:**

```json
{
  "type": "success",
  "data": {
    "platformTenantGroupId": 1,
    "nombre": "QA-GRP-Manny",
    "activo": true,
    "tenantsCount": 0,
    "tenants": []
  }
}
```

Qué significa cada dato:

- `platformTenantGroupId`: el número con el que el sistema identifica a este grupo de ahora en adelante.
- `nombre`: cómo lo llama el área comercial, con lo que se lee el tablero.
- `activo`: puede valer `true` (sí, el grupo está vigente y admite cuentas nuevas) o `false` (no, está desactivado: sigue existiendo y sigue viéndose, pero ya no admite cuentas nuevas).
- `tenantsCount`: cuántas cuentas tiene hoy el grupo.
- `tenants`: la lista de cuentas del grupo, una por una.

## 3. Escenario 2 — El nombre repetido se rechaza

Usuario: **A**. Con el grupo del Escenario 1 todavía vigente.

**Endpoint:** `POST /api/platform/tenant-groups`

```json
{ "nombre": "  qa-grp-manny  " }
```

**Response — 422:**

```json
{
  "title": "No fue posible crear el grupo de tenants",
  "detail": "Ya existe un grupo de tenants registrado con ese nombre.",
  "key": "nombre-de-grupo-ya-registrado",
  "code": "PLT.GRP.NAME_TAKEN"
}
```

Qué significa lo nuevo aquí: `title` y `detail` dicen en palabras simples que ese nombre ya está ocupado por otro grupo vigente (los espacios de más y las mayúsculas no lo hacen distinto); `key` y `code` son las claves cortas del error para reportarlo. (Los datos de grupo son los ya explicados en el Escenario 1.)

Verifica que no quedó un grupo duplicado a medias: el listado del Escenario 6 sigue trayendo un solo `QA-GRP-Manny`.

## 4. Escenario 3 — Renombrar y desactivar sin perder nada

Usuario: **A**. Usa el `id` resuelto con la consulta de Preparar.

**Endpoint:** `PUT /api/platform/tenant-groups/:id`

```json
{ "nombre": "QA-GRP-Manny Corporativo", "activo": false }
```

**Response — 200:**

```json
{
  "type": "success",
  "data": {
    "platformTenantGroupId": 1,
    "nombre": "QA-GRP-Manny Corporativo",
    "activo": false,
    "tenantsCount": 0,
    "tenants": []
  }
}
```

(Los datos son los ya explicados en el Escenario 1.)

**Endpoint:** `PUT /api/platform/tenant-groups/:id`

```json
{}
```

**Response — 422:**

```json
{
  "title": "Grupos de tenants de plataforma",
  "detail": "Indica al menos el nombre o la vigencia para actualizar el grupo.",
  "key": "datos-invalidos",
  "code": "PLT.GRP.VAL_INPUT"
}
```

Qué significa lo nuevo aquí: `detail` dice que no mandaste ningún cambio (ni nombre ni vigencia), así que no hay nada que guardar.

## 5. Escenario 4 — Dar de baja libera el nombre y las cuentas quedan sueltas

Usuario: **A**. Crea primero un segundo grupo para este escenario.

**Endpoint:** `POST /api/platform/tenant-groups`

```json
{ "nombre": "QA-GRP-Baja" }
```

**Response — 201:** igual al Escenario 1 con ese nombre. (Sin datos nuevos.)

**Endpoint:** `DELETE /api/platform/tenant-groups/:id` (el `id` de `QA-GRP-Baja`)

**Response — 200:**

```json
{
  "type": "success",
  "data": { "platformTenantGroupId": 2, "tenantsLiberados": 0 }
}
```

Qué significa cada dato:

- `tenantsLiberados`: cuántas cuentas quedaron sueltas al dar de baja el grupo.

**Endpoint:** `POST /api/platform/tenant-groups`

```json
{ "nombre": "QA-GRP-Baja" }
```

**Response — 201:** igual al Escenario 1 con ese nombre. (Sin datos nuevos: verifica que el nombre liberado se puede volver a usar.)

Verifica además que el grupo dado de baja ya no aparece en el listado del Escenario 6.

## 6. Escenario 5 — Lo que ya no existe responde que no existe

Usuario: **A**.

**Endpoint:** `PUT /api/platform/tenant-groups/999999`

```json
{ "nombre": "QA-GRP-Fantasma" }
```

**Response — 404:**

```json
{
  "title": "Grupos de tenants de plataforma",
  "detail": "El grupo de tenants solicitado no existe o no está disponible.",
  "key": "grupo-no-encontrado",
  "code": "PLT.GRP.NOT_FOUND"
}
```

Qué significa cada dato aquí: `title` y `detail` dicen en palabras simples que ese grupo no existe (o ya fue dado de baja, que para quien consulta es lo mismo); `key` y `code` son las claves cortas del error para reportarlo.

**Endpoint:** `DELETE /api/platform/tenant-groups/999999`

**Response — 404:** el mismo cuerpo del `PUT` anterior. (Sin datos nuevos.)

Repite el `DELETE` con el `id` del grupo que diste de baja en el Escenario 4: también responde `404` con el mismo cuerpo.

## 7. Escenario 6 — El listado trae solo los vigentes, con sus cuentas

Usuario: **A**.

**Endpoint:** `GET /api/platform/tenant-groups`

**Response — 200:**

```json
{
  "type": "success",
  "data": [
    {
      "platformTenantGroupId": 1,
      "nombre": "QA-GRP-Manny Corporativo",
      "activo": false,
      "tenantsCount": 0,
      "tenants": []
    },
    { "...": "un objeto igual por cada grupo vigente" }
  ],
  "meta": { "total": 2, "page": 1, "limit": 20, "lastPage": 1 }
}
```

Qué significa lo nuevo aquí:

- `meta.total`: cuántos grupos vigentes hay en total.
- `meta.page`: la página que estás viendo.
- `meta.limit`: cuántos grupos trae como máximo cada página.
- `meta.lastPage`: la última página disponible.

(Los datos de cada grupo son los ya explicados en el Escenario 1.)

Verifica que:

- Los grupos vienen ordenados por `nombre` de la A a la Z.
- El grupo dado de baja en el Escenario 4 no aparece.
- Con `GET /api/platform/tenant-groups?incluirInactivos=true` aparece además `QA-GRP-Manny Corporativo` (que está desactivado); sin ese filtro no aparece.
- Ningún integrante trae identificadores internos, RFC ni datos fiscales: cada uno trae solo su identificador público y su nombre.

## 8. Escenario 7 — Sin el marcador de plataforma no se ve ni se toca nada

Usuario: **B** (`qa-tenant-groups-sin-marca`).

**Endpoint:** `GET /api/platform/tenant-groups`

**Response — 403:**

```json
{
  "title": "Acceso restringido a plataforma",
  "detail": "...",
  "key": "AUTH.PLATFORM.FORBIDDEN"
}
```

Qué significa lo nuevo aquí: `key` dice que el usuario no tiene el pase de plataforma, así que no puede ver ni tocar los grupos; por eso la respuesta no trae ningún grupo. (`title` es el ya explicado en el Escenario 5.)

Verifica que la respuesta **no traiga campo `code`** (es una inconsistencia conocida del guard, no un defecto de esta historia) y repite con `POST`, `PUT` y `DELETE`: los cuatro responden el mismo `403`.

Y sin token, sin ningún `Authorization`:

**Response — 401** (no se valida cuerpo: es el manejo genérico de autenticación del framework, no un contrato de esta historia).

## 9. Checklist

- [ ] Escenario 1: crear `QA-GRP-Manny` responde `201`, nace vigente y con cero cuentas
- [ ] Escenario 2: repetir el nombre con espacios y minúsculas responde `422` con `PLT.GRP.NAME_TAKEN`, sin duplicado
- [ ] Escenario 3: renombrar y desactivar responde `200` conservando todo; cuerpo vacío responde `422` con `PLT.GRP.VAL_INPUT`
- [ ] Escenario 4: la baja responde `200` con `tenantsLiberados`, el nombre se puede volver a usar y las cuentas quedan intactas
- [ ] Escenario 5: id inexistente o dado de baja responde `404` con `PLT.GRP.NOT_FOUND` en `PUT` y `DELETE`
- [ ] Escenario 6: el listado trae solo vigentes ordenados por nombre, con vigencia, conteo e integrantes, y `meta` completa
- [ ] Escenario 7: sin el marcador de plataforma, los cuatro endpoints responden `403` sin campo `code`; sin token, `401`
```

- [ ] **Step 2: Verificar que el manual cumple la regla (contrato, no código)**

```bash
grep -c "app/\|#models\|#services\|middleware\|Vine\|Lucid" docs/superpowers/plans/2026-09-10-grupos-tenants-api-qa-api.md || echo "0 menciones de código: correcto"
```

Expected: `0 menciones de código: correcto`.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-09-10-grupos-tenants-api-qa-api.md docs/superpowers/plans/2026-09-10-grupos-tenants-api.md
git commit -m "feat: Agregar manual QA API de grupos de tenants"
```

---

## Self-Review

1. Spec coverage: CA-1 alta (Task 5 `createGroup` + Task 7 Step 1); CA-2 duplicado (Task 5 normalización + índice + Task 7 Step 2); CA-3 reuso tras baja (Task 1 columna generada + Task 7 Step 5); CA-4 renombrar/desactivar y PUT vacío (Task 5 `updateGroup` + Task 7 Steps 3-4); CA-5 baja transaccional (Task 5 `deleteGroup` + Task 7 Step 5); CA-6 404 (Task 5 + Task 7 Step 6); CA-7 listado (Task 5 `listGroups` + Task 7 Step 7); CA-8 403 del guard (Task 6 rutas + Task 7 Step 8); contrato, validadores, catálogo, resolvedor, modelos, migraciones y DoD cubiertos en Tasks 1-6; playbook QA API (Task 8) cubre CA-1 a CA-8 en lenguaje de negocio con URL base, seeder único, usuarios `qa-tenant-groups-*` y consultas SQL para ids.
2. Placeholder scan: sin TBD/TODO; cada paso trae código o comando literal; sin "similar a la Task N"; sin validaciones vagas.
3. Type consistency: `TenantGroupItem` con `platformTenantGroupId, nombre, activo, tenantsCount, tenants` usado igual en servicio y controlador; `TenantGroupMemberItem` con `businessUnitPublicId, businessUnitName` en ambas; `resolveTenantGroupApiError` con la misma firma en los cuatro métodos del controlador; `listGroups` recibe `ListTenantGroupsFilters` que el controlador arma desde `listTenantGroupsValidator`.
