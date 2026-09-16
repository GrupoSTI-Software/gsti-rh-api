# Asignar y quitar tenants de un grupo (API) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar `PUT /api/platform/tenant-groups/:platformTenantGroupId/members` con semántica de reemplazo de conjunto transaccional, y extender el listado de tenants con el grupo al que pertenece cada uno.

**Architecture:** Ampliar el módulo de grupos que ya creó USRH1788052455657 (catálogo de errores, validador, servicio, controlador, archivo de rutas) con un verbo nuevo; el servicio resuelve uuid→id, valida el lote completo **antes** de abrir la transacción, y dentro de ella vacía el grupo, saca a los entrantes de su grupo anterior e inserta el conjunto nuevo. El listado de tenants gana un campo `grupo` resuelto con **una** consulta `whereIn` por página, plegada en un mapa y consumida por `toListItem`, espejando el mapa de empleados activos.

**Tech Stack:** AdonisJS 6 + Lucid (MySQL), Knex crudo para las consultas de plataforma, Vine 2.1, TypeScript estricto (cero `any`).

## Global Constraints

- Todo el código, comentarios y documentación en español, excepto nombres de variables, funciones, clases y métodos (en inglés), palabras reservadas y nombres de librerías.
- Sin emojis en código, comentarios ni documentación.
- **Ninguna migración, ningún modelo nuevo, ninguna columna nueva.** La estructura ya existe (verificada: `database/migrations/1788282413067000_*` y `1788282413067001_*`).
- No modificar `app/models/business_unit.ts` bajo ninguna circunstancia. El vínculo es pivote; la superficie hacia el tenant es cero.
- Ningún modelo Lucid se serializa: prohibido `.serialize()`, `.toJSON()` y `{ ...modelo }`; armar respuestas campo por campo con casteo explícito.
- Nunca publicar `business_unit_id` interno; la clave externa del tenant es siempre `businessUnitPublicId` (UUID). `platformTenantGroupId` es la excepción declarada (entidad de plataforma, igual que `platformDeviceId`).
- Sin `rfc`, perfil fiscal, `billingEmail` ni `billingSubscriptionId` en ningún payload de esta HU.
- Las consultas crudas filtran `platform_tenant_group_deleted_at IS NULL` y `business_unit_deleted_at IS NULL` **a mano y explícito**: Knex no pasa por el hook de `SoftDeletes`.
- `key` (kebab español) y `code` (punteado `PLT.GRP.*`) son campos distintos. La rama de validación Vine emite `key: 'datos-invalidos'` + `code: PLT.GRP.VAL_INPUT`; la resuelve `resolveTenantGroupApiError`, que ya existe y **no se toca**.
- TypeScript estricto, cero `any`; interfaces de retorno exportadas arriba del servicio.
- Guard a nivel de grupo `[middleware.auth({ guards: ['api'] }), middleware.platformAdmin()]`, nunca ruta por ruta; sin rate limiter.
- **No se agrega línea a `start/routes.ts`**: `platform_tenant_group_routes.ts` ya está importado desde USRH1788052455657.
- Documentación duplicada obligatoria en el controlador: bloque `@swagger` **y** anotaciones AdonisJS (`@responseBody`), ambas en español.
- **La extensión del listado es aditiva.** Ningún campo existente de `TenantListItem` cambia de nombre, tipo ni valor. Si al implementar parece necesario tocar uno, se para y se escala a Wilvardo.
- Commits en Conventional Commits con descripción en español (ej. `feat: Agregar reemplazo de miembros de grupo`).

---

## Hallazgos de validación del spec (leer antes de empezar)

El spec es hipótesis sobre `valanserh-api@c0eb63a6`. Se validó contra la rama `feature/USRH1788055613533-asignar-tenants-grupo` del repo `gsti-rh-api`. Resultado:

| Anclaje del spec | Estado | Consecuencia |
|---|---|---|
| Tablas y pivote creados por ESB-11 | **Confirmado** | Ninguna migración |
| `UNIQUE(business_unit_id)` = `uq_platform_tenant_group_member_bu` | **Confirmado** | La regla 2 vive en la base |
| Catálogo `PLT.GRP.*` con `VAL_INPUT`, `NOT_FOUND`, `NAME_TAKEN`, `SYS_UNHANDLED` | **Confirmado** | `TENANT_NOT_FOUND` e `INACTIVE_NOT_ASSIGNABLE` **no existen**: los agrega la Task 1 |
| `platform_tenant_group_routes.ts` con guard a nivel de grupo | **Confirmado** | Solo se agrega el verbo |
| Patrón de mapa por página en `platform_tenant_service.ts` | **Confirmado** (`:276-291` empleados, `:293-296` fiscal) | Se espeja |
| `resolveTenantGroupApiError` y `PlatformTenantGroupServiceError` | **Confirmado** | Se reutilizan sin tocar |
| El spec dice que solo cambia el **listado** de tenants | **Incompleto** | `TenantDetail extends TenantListItem` (`:93`): agregar `grupo` obliga a `getTenantDetail` a publicarlo también. Es aditivo y se cubre en la Task 5 |
| El spec habla de "colisión de `/:id` con segmento literal" | **No aplica** | `/:platformTenantGroupId/members` no colisiona con nada. Se conserva el `matchers.number()` por consistencia con las rutas hermanas |

**Contradicción del spec resuelta en este plan (confirmar con Wilvardo en revisión):** la regla 10 dice que un tenant con baja lógica "no se cuenta como miembro de ningún grupo", pero el CA-11 exige que su membresía huérfana **no se purgue** y que vuelva a su grupo si lo restauran. Un borrado ciego de "todos los miembros del grupo" destruiría esa fila, porque el operador nunca la vio en el selector y no puede conservarla. **Decisión:** el vaciado del grupo alcanza únicamente a los miembros cuya `business_unit` está viva. Así conviven la regla 10 (no se cuenta ni se ofrece) y el CA-11 (no se purga, vuelve al restaurar). Queda documentado en el código y en el manual de QA.

**Decisión de diseño declarada:** una colisión de `ER_DUP_ENTRY` por concurrencia sobre el mismo tenant se traduce a **422 `PLT.GRP.VAL_INPUT`** con un `detail` que explica que otra operación acaba de asignar esa cuenta. El spec exige "error controlado, nunca 500 sin traducir" pero congeló el catálogo en dos códigos nuevos; si Wilvardo prefiere un código propio (`PLT.GRP.MEMBER_CONFLICT`, 409), es un cambio de una línea en el catálogo y otra en el servicio.

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `app/constants/platform_tenant_group_error_codes.ts` (edit) | Agrega `TENANT_NOT_FOUND` e `INACTIVE_NOT_ASSIGNABLE` |
| `app/validators/platform_tenant_group.ts` (edit) | Agrega `replaceTenantGroupMembersValidator` |
| `app/services/platform_tenant_group_service.ts` (edit) | Agrega `TenantGroupMovedItem`, `ReplaceTenantGroupMembersResult` y el método `replaceMembers` |
| `app/controllers/platform_tenant_group_controller.ts` (edit) | Agrega la acción `replaceMembers` con doble documentación |
| `start/routes/platform_tenant_group_routes.ts` (edit) | Agrega `PUT /:platformTenantGroupId/members` dentro del grupo existente |
| `app/services/platform_tenant_service.ts` (edit) | Agrega `TenantGroupRef`, el campo `grupo` a `TenantListItem`, el mapa `loadTenantGroupMap` y su consumo en `listTenants`, `getTenantDetail`, `toListItem` y `toTenantDetail` |

**Contrato publicado por esta HU:**

```
PUT /api/platform/tenant-groups/:platformTenantGroupId/members
body → { "businessUnitPublicIds": ["uuid", ...] }   // puede ir vacío; máx 200; sin duplicados
200  → { "type": "success", "data": {
          "platformTenantGroupId": 7,
          "asignados": 2,
          "liberados": 1,
          "movidos": [ { "businessUnitPublicId": "uuid", "grupoAnteriorId": 9, "grupoAnteriorNombre": "Grupo Norte" } ]
        } }
422  → { title, detail, key: 'datos-invalidos',                   code: 'PLT.GRP.VAL_INPUT' }
422  → { title, detail, key: 'tenant-no-encontrado',              code: 'PLT.GRP.TENANT_NOT_FOUND' }
422  → { title, detail, key: 'grupo-inactivo-no-admite-tenants',  code: 'PLT.GRP.INACTIVE_NOT_ASSIGNABLE' }
404  → { title, detail, key: 'grupo-no-encontrado',               code: 'PLT.GRP.NOT_FOUND' }
403  → { title, detail, key: 'AUTH.PLATFORM.FORBIDDEN' }          // sin `code`, inconsistencia heredada
500  → { title, detail, key: 'error-inesperado',                  code: 'PLT.GRP.SYS_UNHANDLED' }

GET /api/platform/tenants          → cada elemento gana `grupo: TenantGroupRef | null`
GET /api/platform/tenants/:id      → gana el mismo campo (arrastre de `TenantDetail extends TenantListItem`)
interface TenantGroupRef { platformTenantGroupId: number; nombre: string; activo: boolean }
```

---

### Task 1: Códigos de error de membresía

**Files:**
- Modify: `app/constants/platform_tenant_group_error_codes.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `PLATFORM_TENANT_GROUP_ERROR_CODES.TENANT_NOT_FOUND` y `.INACTIVE_NOT_ASSIGNABLE`, usados por la Task 3. El tipo `PlatformTenantGroupErrorCode` se amplía solo, por derivarse del objeto.

- [ ] **Step 1: Agregar las dos entradas al catálogo**

Reemplaza el objeto completo por este (conserva las cuatro entradas existentes en su orden):

```typescript
export const PLATFORM_TENANT_GROUP_ERROR_CODES = {
  /** Body/query inválido (Vine) o PUT sin ningún campo */
  VAL_INPUT: 'PLT.GRP.VAL_INPUT',
  /** Grupo no encontrado por id (incluye dados de baja) */
  NOT_FOUND: 'PLT.GRP.NOT_FOUND',
  /** Nombre ya usado por un grupo vivo */
  NAME_TAKEN: 'PLT.GRP.NAME_TAKEN',
  /** Un businessUnitPublicId del lote no existe o tiene baja lógica (USRH1788055613533) */
  TENANT_NOT_FOUND: 'PLT.GRP.TENANT_NOT_FOUND',
  /** El grupo destino está apagado y no admite asignaciones nuevas (USRH1788055613533) */
  INACTIVE_NOT_ASSIGNABLE: 'PLT.GRP.INACTIVE_NOT_ASSIGNABLE',
  /** Error no tipado del sistema */
  SYS_UNHANDLED: 'PLT.GRP.SYS_UNHANDLED',
} as const
```

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add app/constants/platform_tenant_group_error_codes.ts
git commit -m "feat: Agregar codigos de error de membresia de grupos"
```

---

### Task 2: Validador Vine del reemplazo de miembros

**Files:**
- Modify: `app/validators/platform_tenant_group.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `replaceTenantGroupMembersValidator`, usado por la Task 4. Salida validada: `{ businessUnitPublicIds: string[] }`.

- [ ] **Step 1: Agregar el validador al final del archivo**

`vine.array(...).distinct()` sin argumentos compara los valores del arreglo, no campos de objetos: es la comprobación de duplicados intra-payload del CA-7. `maxLength(200)` es el tope del contrato. El arreglo **no** lleva `minLength`: la lista vacía es válida y vacía el grupo (regla 6).

```typescript
/**
 * Body para `PUT /api/platform/tenant-groups/:platformTenantGroupId/members`.
 * Conjunto completo de miembros: lo que llegue es exactamente lo que queda.
 * Puede ir vacío (vacía el grupo, regla 6). Sin duplicados y máximo 200 elementos.
 */
export const replaceTenantGroupMembersValidator = vine.compile(
  vine.object({
    businessUnitPublicIds: vine.array(vine.string().trim().uuid()).distinct().maxLength(200),
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
git commit -m "feat: Agregar validador de reemplazo de miembros de grupo"
```

---

### Task 3: Servicio `replaceMembers` transaccional

**Files:**
- Modify: `app/services/platform_tenant_group_service.ts`

**Interfaces:**
- Consumes: `PLATFORM_TENANT_GROUP_ERROR_CODES` (Task 1), `PlatformTenantGroupServiceError` (ya existe).
- Produces:
  - `interface TenantGroupMovedItem { businessUnitPublicId: string; grupoAnteriorId: number; grupoAnteriorNombre: string }`
  - `interface ReplaceTenantGroupMembersResult { platformTenantGroupId: number; asignados: number; liberados: number; movidos: TenantGroupMovedItem[] }`
  - `PlatformTenantGroupService.replaceMembers(id: number, businessUnitPublicIds: string[]): Promise<ReplaceTenantGroupMembersResult>`, usado por la Task 4.

- [ ] **Step 1: Agregar las interfaces de retorno y el título de error**

Debajo de `DeleteTenantGroupResult` (línea ~38), en el bloque `─── Tipos de retorno ───`:

```typescript
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
```

Y junto a `TITULO_NOMBRE_GRUPO_YA_REGISTRADO` (línea 6):

```typescript
const TITULO_ASIGNACION_MIEMBROS = 'No fue posible asignar las cuentas al grupo'
```

- [ ] **Step 2: Implementar `replaceMembers` al final de la clase**

Va después de `obtenerGrupoConIntegrantes`, antes del cierre de la clase. Las validaciones caras ocurren **antes** de abrir la transacción: así el "todo o nada" del CA-4 no depende del rollback, y la transacción dura lo mínimo.

```typescript
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
```

- [ ] **Step 3: Verificar que `multiInsert` existe en el cliente de transacción**

```bash
grep -rn "multiInsert" app/services/ | head -5
```

Expected: al menos un precedente en el repo. Si no aparece ninguno, sustituye la llamada por `await trx.table('platform_tenant_group_members').insert(...)` con el mismo arreglo y vuelve a verificar tipos.

- [ ] **Step 4: Verificar tipos**

```bash
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add app/services/platform_tenant_group_service.ts
git commit -m "feat: Agregar reemplazo transaccional de miembros de grupo"
```

---

### Task 4: Controlador y ruta del PUT de miembros

**Files:**
- Modify: `app/controllers/platform_tenant_group_controller.ts`
- Modify: `start/routes/platform_tenant_group_routes.ts`

**Interfaces:**
- Consumes: `replaceTenantGroupMembersValidator` (Task 2), `PlatformTenantGroupService.replaceMembers` (Task 3), `resolveTenantGroupApiError` (ya existe).
- Produces: la acción `replaceMembers` del controlador y la ruta `PUT /api/platform/tenant-groups/:platformTenantGroupId/members`.

- [ ] **Step 1: Agregar la acción al final de la clase del controlador**

Va después de `destroy`, antes del cierre de la clase. Doble documentación obligatoria: bloque `@swagger` y anotaciones AdonisJS.

```typescript
  /**
   * @swagger
   * /api/platform/tenant-groups/{platformTenantGroupId}/members:
   *   put:
   *     tags:
   *       - Platform · TenantGroups
   *     summary: Reemplazar el conjunto de cuentas de un grupo
   *     description: |
   *       Guarda el conjunto completo: lo que llega es exactamente lo que queda en el grupo.
   *       Las cuentas que no vengan en la lista salen del grupo y quedan sueltas conservando
   *       toda su información. Una cuenta que ya pertenezca a otro grupo se mueve en la misma
   *       operación, y la respuesta declara de dónde salió en `movidos`.
   *       La lista vacía es válida: vacía el grupo.
   *       Todo o nada: si una cuenta no existe o está dada de baja, no se guarda ningún cambio.
   *       Un grupo desactivado no admite asignaciones nuevas.
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
   *             required: [businessUnitPublicIds]
   *             properties:
   *               businessUnitPublicIds:
   *                 type: array
   *                 maxItems: 200
   *                 items:
   *                   type: string
   *                   format: uuid
   *     responses:
   *       '200':
   *         description: Conjunto de cuentas reemplazado
   *       '404':
   *         description: Grupo no encontrado o dado de baja
   *       '422':
   *         description: Datos inválidos, cuenta no encontrada o grupo desactivado
   *       '403':
   *         description: Sin permisos de administrador de plataforma
   *
   * @replaceMembers
   * @summary Reemplazar el conjunto de cuentas de un grupo
   * @description Guarda el conjunto completo de cuentas del grupo en una sola operación indivisible. Mueve las cuentas que venían de otro grupo y declara su procedencia. La lista vacía vacía el grupo. Requiere sesión válida y marca de administrador de plataforma.
   * @tag Platform · TenantGroups
   * @operationId replacePlatformTenantGroupMembers
   * @security [{"bearerAuth": []}]
   * @paramPath platformTenantGroupId - Identificador del grupo - integer
   * @requestBody {"businessUnitPublicIds": ["3f2a1c8e-0b5d-4c7a-9e11-6d2f8a4b0c31"]}
   * @responseBody 200 - {"type": "success", "data": {"platformTenantGroupId": 7, "asignados": 2, "liberados": 1, "movidos": [{"businessUnitPublicId": "3f2a1c8e-0b5d-4c7a-9e11-6d2f8a4b0c31", "grupoAnteriorId": 9, "grupoAnteriorNombre": "Grupo Norte"}]}}
   * @responseBody 404 - {"title": "string", "detail": "string", "key": "grupo-no-encontrado", "code": "PLT.GRP.NOT_FOUND"}
   * @responseBody 422 - {"title": "string", "detail": "string", "key": "tenant-no-encontrado", "code": "PLT.GRP.TENANT_NOT_FOUND"}
   * @responseBody 403 - {"title": "string", "detail": "string", "key": "AUTH.PLATFORM.FORBIDDEN"}
   */
  async replaceMembers({ params, request, response }: HttpContext) {
    try {
      const { businessUnitPublicIds } = await request.validateUsing(
        replaceTenantGroupMembersValidator
      )
      const resultado = await this.service.replaceMembers(
        Number(params.platformTenantGroupId),
        businessUnitPublicIds
      )
      return response.status(200).json({ type: 'success', data: resultado })
    } catch (error) {
      const { status: httpStatus, ...body } = resolveTenantGroupApiError(error)
      return response.status(httpStatus).json(body)
    }
  }
```

- [ ] **Step 2: Agregar el import del validador**

En el bloque de imports de `#validators/platform_tenant_group`, agrega `replaceTenantGroupMembersValidator` conservando el orden alfabético:

```typescript
import {
  createTenantGroupValidator,
  listTenantGroupsValidator,
  replaceTenantGroupMembersValidator,
  updateTenantGroupValidator,
} from '#validators/platform_tenant_group'
```

- [ ] **Step 3: Agregar la ruta dentro del grupo existente**

En `start/routes/platform_tenant_group_routes.ts`, agrega la línea del encabezado y el verbo. **No** se toca `.prefix()` ni `.use()`, y **no** se agrega nada a `start/routes.ts`.

En el comentario del encabezado, después de la línea del `DELETE`:

```
 *   PUT    /api/platform/tenant-groups/:platformTenantGroupId/members → reemplazo de cuentas
```

Y dentro del `router.group(() => { ... })`, después del `delete`:

```typescript
    router
      .put(
        '/:platformTenantGroupId/members',
        '#controllers/platform_tenant_group_controller.replaceMembers'
      )
      .where('platformTenantGroupId', router.matchers.number())
```

- [ ] **Step 4: Levantar el servidor y verificar que la ruta existe**

```bash
node ace list:routes | grep -i "tenant-groups"
```

Expected: aparecen las cinco rutas del grupo, incluida `PUT /api/platform/tenant-groups/:platformTenantGroupId/members`.

- [ ] **Step 5: Verificar tipos**

```bash
npx tsc --noEmit
```

Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add app/controllers/platform_tenant_group_controller.ts start/routes/platform_tenant_group_routes.ts
git commit -m "feat: Agregar endpoint de reemplazo de miembros de grupo"
```

---

### Task 5: Grupo de cada tenant en el listado y el detalle

**Files:**
- Modify: `app/services/platform_tenant_service.ts`

**Interfaces:**
- Consumes: nada de las tareas anteriores (lee la misma tabla pivote).
- Produces:
  - `interface TenantGroupRef { platformTenantGroupId: number; nombre: string; activo: boolean }`
  - Campo `grupo: TenantGroupRef | null` en `TenantListItem` (y por herencia en `TenantDetail`), consumido por el landlord.

**Contexto obligatorio:** `TenantDetail extends TenantListItem` (`app/services/platform_tenant_service.ts:93`). Agregar el campo al listado obliga a alimentarlo también en `getTenantDetail`, o `tsc` falla. Las dos rutas se cubren en esta tarea.

- [ ] **Step 1: Agregar la interfaz y el campo**

Junto a `TenantBillingCompleteness` (línea ~44), agrega:

```typescript
/**
 * Grupo económico al que pertenece un tenant (USRH1788055613533).
 * `activo` viaja para que la vista distinga la pertenencia a un grupo apagado
 * sin una segunda llamada. `platformTenantGroupId` es excepción declarada a H11:
 * es entidad de plataforma, igual que `platformDeviceId`.
 */
export interface TenantGroupRef {
  platformTenantGroupId: number
  nombre: string
  activo: boolean
}
```

Y como último campo de `TenantListItem`, después de `subscription`:

```typescript
  /** Grupo económico del tenant; `null` significa suelto, estado válido y visible (regla 9). */
  grupo: TenantGroupRef | null
```

- [ ] **Step 2: Agregar el cargador del mapa**

Va junto a `loadBillingCompletenessMap` (línea ~420), del que espeja la forma. Una consulta por página, nunca una por renglón (CA-10).

```typescript
  /**
   * Resuelve el grupo de un conjunto de cuentas en UNA consulta (jamás una por fila;
   * espeja el mapa de empleados activos del listado).
   *
   * El `UNIQUE(business_unit_id)` del pivote garantiza a lo más una fila por cuenta,
   * así que el mapa no puede perder información. Un vínculo cuyo grupo tenga baja
   * lógica se trata como "sin grupo": queda fuera del mapa y el tenant sale `null`.
   *
   * @param businessUnitIds - Ids internos de las cuentas de la página.
   * @returns Mapa de id interno a grupo; las cuentas sueltas no tienen entrada.
   */
  private async loadTenantGroupMap(
    businessUnitIds: number[]
  ): Promise<Record<number, TenantGroupRef>> {
    if (businessUnitIds.length === 0) return {}

    const filas = await db
      .from('platform_tenant_group_members as m')
      .join(
        'platform_tenant_groups as g',
        'g.platform_tenant_group_id',
        'm.platform_tenant_group_id'
      )
      .whereIn('m.business_unit_id', businessUnitIds)
      .whereNull('g.platform_tenant_group_deleted_at')
      .select([
        'm.business_unit_id as buId',
        'g.platform_tenant_group_id as platformTenantGroupId',
        'g.platform_tenant_group_name as nombre',
        'g.platform_tenant_group_active as activo',
      ])

    const mapa: Record<number, TenantGroupRef> = {}
    for (const fila of filas as Array<{
      buId: number
      platformTenantGroupId: number
      nombre: string
      activo: number
    }>) {
      mapa[Number(fila.buId)] = {
        platformTenantGroupId: Number(fila.platformTenantGroupId),
        nombre: fila.nombre,
        activo: Number(fila.activo) === 1,
      }
    }
    return mapa
  }
```

- [ ] **Step 3: Consumirlo en `listTenants`**

En el bloque `── 7. Completitud fiscal de la página ──`, agrega el bloque 7b justo después:

```typescript
    // ── 7b. Grupo económico de la página (UNA consulta, no una por fila) ──────
    const grupoPorBu = await this.loadTenantGroupMap(rows.map((r) => r.buId as number))
```

Y en el bloque 8, agrega el cuarto argumento a `toListItem`:

```typescript
      return this.toListItem(
        sub ? { ...r, ...sub } : r,
        employeeCounts[r.businessUnitPublicId as string] ?? 0,
        // Sin entrada en el mapa = nunca capturó perfil (regla 2).
        billingCompleteness[r.buId as number] ?? resolveTenantBillingCompleteness(null),
        // Sin entrada en el mapa = tenant suelto (regla 9).
        grupoPorBu[r.buId as number] ?? null
      )
```

- [ ] **Step 4: Consumirlo en `getTenantDetail`**

En `getTenantDetail`, junto a la carga del perfil fiscal (línea ~391), agrega la carga del grupo y pásalo a `toTenantDetail`:

```typescript
    const merged = sub ? { ...row, ...(sub as Record<string, unknown>) } : row
    const billingProfile = await this.loadBillingProfileSnapshot(row.buId as number)
    const grupoPorBu = await this.loadTenantGroupMap([row.buId as number])

    return this.toTenantDetail(
      merged,
      activeEmployees,
      billingProfile,
      grupoPorBu[row.buId as number] ?? null
    )
```

- [ ] **Step 5: Propagar el parámetro en los dos serializadores**

`toTenantDetail` recibe el grupo y lo reenvía; `toListItem` lo publica. Ningún campo existente cambia.

```typescript
  private toTenantDetail(
    row: Record<string, unknown>,
    activeEmployees: number,
    billingProfile: TenantBillingProfileSnapshot | null,
    grupo: TenantGroupRef | null
  ): TenantDetail {
    return {
      ...this.toListItem(
        row,
        activeEmployees,
        // La raíz repite la completitud que ya calculó el snapshot; cuando no hay
        // perfil, la misma regla del listado dice `false` + los cinco (regla 2).
        billingProfile
          ? {
              complete: billingProfile.billingProfileComplete,
              missingFields: billingProfile.missingFields,
            }
          : resolveTenantBillingCompleteness(null),
        grupo
      ),
      billingProfile,
    }
  }

  private toListItem(
    row: Record<string, unknown>,
    activeEmployees: number,
    billingCompleteness: TenantBillingCompleteness,
    grupo: TenantGroupRef | null
  ): TenantListItem {
```

Y como último campo del objeto que devuelve `toListItem`, después de `subscription`:

```typescript
      // `null` es tenant suelto: estado válido y visible, nunca cadena vacía ni objeto vacío.
      grupo,
```

- [ ] **Step 6: Verificar tipos**

```bash
npx tsc --noEmit
```

Expected: sin errores. Si `tsc` señala otra llamada a `toListItem` o `toTenantDetail` que no recibe el cuarto argumento, agrégalo ahí con el valor que corresponda; no lo silencies con `undefined`.

- [ ] **Step 7: Verificar que el cambio es aditivo**

```bash
git diff app/services/platform_tenant_service.ts | grep '^-' | grep -v '^---'
```

Expected: las únicas líneas eliminadas son las firmas de `toListItem`/`toTenantDetail`, la llamada a `toListItem` dentro de `listTenants`, la llamada a `toTenantDetail` y el `return this.toTenantDetail(...)`. **Ninguna línea de campo publicado desaparece.** Si aparece otra, para y revierte.

- [ ] **Step 8: Commit**

```bash
git add app/services/platform_tenant_service.ts
git commit -m "feat: Publicar el grupo de cada tenant en listado y detalle"
```

---

### Task 6: Verificación integral de los criterios de aceptación

**Files:**
- Ninguno (verificación con cliente HTTP contra el servidor local).

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: evidencia de los 13 criterios.

**Preparación:** levanta el API (`node ace serve --hmr`), consigue un token de un usuario con `is_platform_admin = 1` y otro sin la marca. Ten a la mano cuatro `businessUnitPublicId` de cuentas vivas (A, B, C, D) y dos grupos activos (7 destino, 9 "Grupo Norte"). Exporta `TOKEN`, `BASE` (`http://localhost:3333`), `A`, `B`, `C`, `D`.

**Consultas SQL puntuales — verificado, sin cliente `mysql`:** este entorno no tiene el CLI `mysql` instalado. Las consultas de este plan se corren con `node ace repl`, en una sola línea (el REPL no comparte bindings `await` entre líneas separadas), así:

```bash
echo "await (async () => { const db = (await import('@adonisjs/lucid/services/db')).default; const rows = await db.rawQuery(\"TU SQL AQUI\"); console.log(JSON.stringify(rows[0])); })()" | node ace repl 2>&1 | grep -v "Deprecation\|trace-deprecation\|TensorFlow\|tfjs\|====\|👋\|Type \".ls\""
```

Verificado al escribir este plan: devuelve el resultado real de la consulta. El `grep -v` solo filtra el ruido fijo que imprime la REPL (advertencias de deprecación y el aviso de TensorFlow.js), nunca datos de la consulta.

- [ ] **Step 1: Reemplazo del conjunto e idempotencia (CA-1)**

Deja el grupo 7 con A y B, luego envía B y C.

```bash
curl -s -X PUT "$BASE/api/platform/tenant-groups/7/members" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"businessUnitPublicIds\":[\"$B\",\"$C\"]}"
```

Expected: `200`, `asignados: 2`, `liberados: 1`. Repetir la misma llamada devuelve `200` con `asignados: 2`, `liberados: 0` y el mismo estado.

- [ ] **Step 2: Mover en lugar de rechazar (CA-2)**

Con C en el grupo 9, envía el PUT del grupo 7 incluyendo C.

Expected: `200`, C queda solo en el 7, y `movidos` trae `{ businessUnitPublicId: <C>, grupoAnteriorId: 9, grupoAnteriorNombre: "Grupo Norte" }`.

- [ ] **Step 3: Un tenant, un grupo (CA-3)**

```bash
echo "await (async () => { const db = (await import('@adonisjs/lucid/services/db')).default; const rows = await db.rawQuery(\"SELECT business_unit_id, COUNT(*) c FROM platform_tenant_group_members GROUP BY business_unit_id HAVING c > 1\"); console.log(JSON.stringify(rows[0])); })()" | node ace repl 2>&1 | grep -v "Deprecation\|trace-deprecation\|TensorFlow\|tfjs\|====\|👋\|Type \".ls\""
```

Expected: `[]` (cero filas). Además:

```bash
echo "await (async () => { const db = (await import('@adonisjs/lucid/services/db')).default; const rows = await db.rawQuery(\"SHOW INDEX FROM platform_tenant_group_members WHERE Key_name='uq_platform_tenant_group_member_bu'\"); console.log(JSON.stringify(rows[0])); })()" | node ace repl 2>&1 | grep -v "Deprecation\|trace-deprecation\|TensorFlow\|tfjs\|====\|👋\|Type \".ls\""
```

Expected: el índice existe (`Non_unique: 0`).

- [ ] **Step 4: Todo o nada con el ofensor nombrado (CA-4)**

Envía tres uuid válidos y uno inexistente.

Expected: `422`, `key: 'tenant-no-encontrado'`, `code: 'PLT.GRP.TENANT_NOT_FOUND'`, el `detail` nombra el uuid ofensor. Consulta el grupo después: **la membresía quedó exactamente como estaba**.

- [ ] **Step 5: Grupo apagado (CA-5)**

Desactiva el grupo 7 (`PUT /tenant-groups/7` con `{"activo": false}`) y envía el PUT de miembros.

Expected: `422`, `key: 'grupo-inactivo-no-admite-tenants'`, `code: 'PLT.GRP.INACTIVE_NOT_ASSIGNABLE'`, nada guardado. Reactívalo al terminar.

- [ ] **Step 6: Grupo inexistente o con baja lógica (CA-6)**

Expected: `404` con `key: 'grupo-no-encontrado'` y `code: 'PLT.GRP.NOT_FOUND'` — no 422.

- [ ] **Step 7: Payload inválido (CA-7)**

Tres llamadas: el mismo uuid repetido; 201 elementos; un elemento que no es uuid.

Expected: las tres responden `422` con `key: 'datos-invalidos'` y `code: 'PLT.GRP.VAL_INPUT'`.

- [ ] **Step 8: Vaciar es válido (CA-8)**

Con tres miembros, envía `{"businessUnitPublicIds": []}`.

Expected: `200`, `liberados: 3`, `asignados: 0`, grupo sin miembros. Verifica que las tres cuentas conservan suscripción y perfil consultando `GET /api/platform/tenants/{publicId}` de cada una.

- [ ] **Step 9: El listado publica el grupo (CA-9)**

```bash
curl -s "$BASE/api/platform/tenants?limit=100" -H "Authorization: Bearer $TOKEN" | jq '.data[] | {businessUnitName, grupo}'
```

Expected: el tenant agrupado trae `{ platformTenantGroupId, nombre, activo }`; el suelto trae `grupo: null` — `null`, nunca cadena vacía ni objeto vacío.

- [ ] **Step 10: Una sola consulta de grupos por página (CA-10)**

`config/database.ts` no tiene `debug: true`, así que no hay un flag de log de consultas ya activado que instrumentar en vivo (`DB_DEBUG` no existe en este repo — no lo actives inventando la variable). La verificación es estática, y es más fuerte que un conteo en vivo porque lo garantiza la forma de la consulta, no una corrida particular:

```bash
grep -n "loadTenantGroupMap(" app/services/platform_tenant_service.ts
```

Expected: exactamente dos apariciones — la definición (`private async loadTenantGroupMap`) y **una sola** llamada dentro de `listTenants` (la de `getTenantDetail` es una llamada distinta, con un arreglo de un solo id, fuera del ciclo por página). Confirma además que el cuerpo de `loadTenantGroupMap` hace un único `db.from(...).whereIn(...)`, nunca una consulta dentro de un `.map()` o `for` sobre `rows`. Con la cadena `whereIn` sobre el arreglo completo de ids de la página, el número de consultas no puede depender de cuántos renglones traiga esa página.

- [ ] **Step 11: Cuentas con baja lógica fuera, sin purga (CA-11)**

Da de baja lógica una cuenta que sea miembro de un grupo. Luego:

```bash
curl -s "$BASE/api/platform/tenants?limit=100" -H "Authorization: Bearer $TOKEN" | jq '.data[].businessUnitPublicId'
echo "await (async () => { const db = (await import('@adonisjs/lucid/services/db')).default; const rows = await db.rawQuery(\"SELECT * FROM platform_tenant_group_members WHERE business_unit_id = <ID>\"); console.log(JSON.stringify(rows[0])); })()" | node ace repl 2>&1 | grep -v "Deprecation\|trace-deprecation\|TensorFlow\|tfjs\|====\|👋\|Type \".ls\""
```

Sustituye `<ID>` por el `business_unit_id` interno de la cuenta (resuélvelo con `SELECT business_unit_id FROM business_units WHERE business_unit_public_id = '<uuid>'` por el mismo patrón).

Expected: no aparece como renglón del listado, **pero su fila de membresía sigue viva**. Guarda otro conjunto en ese mismo grupo y vuelve a consultar la fila: **sigue ahí** (el vaciado no alcanza cuentas con baja lógica). Restaura la cuenta y confirma que vuelve a su grupo anterior.

- [ ] **Step 12: 403 del guard (CA-13)**

Llama a los dos endpoints con el token sin `is_platform_admin`.

Expected: `403` con `{ title, detail, key: 'AUTH.PLATFORM.FORBIDDEN' }` y **sin campo `code`**.

- [ ] **Step 13: Concurrencia sobre el mismo tenant**

Lanza dos PUT simultáneos que asignen la misma cuenta a dos grupos distintos:

```bash
curl -s -X PUT "$BASE/api/platform/tenant-groups/7/members" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"businessUnitPublicIds\":[\"$A\"]}" &
curl -s -X PUT "$BASE/api/platform/tenant-groups/9/members" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"businessUnitPublicIds\":[\"$A\"]}" &
wait
```

Expected: una gana con `200`; la otra devuelve `200` o un `422` controlado con `code: 'PLT.GRP.VAL_INPUT'`. **Nunca un 500 sin traducir.** Confirma con la consulta del Step 3 que no quedaron dos membresías.

- [ ] **Step 14: Verificar que el diff no toca `business_unit.ts`**

```bash
git diff --name-only origin/HEAD... | grep -c "business_unit.ts"
```

Expected: `0`.

- [ ] **Step 15: Confirmar que no hizo falta migración**

```bash
ls database/migrations | sort -n | tail
git status --porcelain database/migrations
```

Expected: sin cambios en `database/migrations`. Si el pivote no existiera, la dependencia de rama no está integrada y se para.

- [ ] **Step 16: Lint y tipos finales**

```bash
npx tsc --noEmit && pnpm lint
```

Expected: ambos en verde.

- [ ] **Step 17: Commit de evidencia (si hubo correcciones)**

```bash
git add -A
git commit -m "fix: Corregir hallazgos de la verificacion de criterios"
```

---

## Self-Review

**1. Cobertura del spec**

| Requisito del spec | Tarea |
|---|---|
| `PUT /members` transaccional con `movidos` | Tasks 3 y 4 |
| Validador, códigos de error, swagger | Tasks 1, 2 y 4 |
| Extensión aditiva de `GET /platform/tenants` | Task 5 |
| CA-1 a CA-11 y CA-13 | Task 6 (CA-12 es de UI, vive en el plan del landlord) |
| Transacción que abarca borrado y alta | Task 3 Step 2, verificado en Task 6 Step 4 |
| Violación del `UNIQUE` traducida, no 500 | Task 3 Step 2, verificado en Task 6 Step 13 |
| `..._deleted_at IS NULL` explícito | Task 3 Step 2 y Task 5 Step 2 |
| Campo `grupo` aditivo | Task 5 Steps 5 y 7 |
| Sin migración | Task 6 Step 15 |
| Ningún modelo Lucid serializado | Constraints; las respuestas se arman campo por campo |
| Manual de QA | **No aplica a este plan.** HU fullstack: un solo manual, el de frontend, en el plan del landlord |

Sin huecos. El CA-12 (advertencia previa al movimiento en el drawer) es responsabilidad del landlord y está cubierto en el plan hermano.

**2. Barrido de placeholders**

Sin "TBD", sin "manejar errores apropiadamente", sin "similar a la Task N". Cada paso de código lleva el código real. Los dos puntos donde el plan pide criterio están marcados como decisión declarada con su alternativa concreta, no como hueco.

**3. Consistencia de tipos**

- `TenantGroupMovedItem` y `ReplaceTenantGroupMembersResult` se definen en la Task 3 Step 1 y se consumen con esos mismos nombres en la Task 4.
- `replaceMembers(id: number, businessUnitPublicIds: string[])` — la firma de la Task 3 coincide con la llamada de la Task 4.
- `TenantGroupRef` se define en la Task 5 Step 1 y se usa con ese nombre en los Steps 2, 4 y 5.
- `loadTenantGroupMap(businessUnitIds: number[]): Promise<Record<number, TenantGroupRef>>` — la firma del Step 2 coincide con las llamadas de los Steps 3 y 4.
- `replaceTenantGroupMembersValidator` — mismo nombre en la Task 2 y en el import de la Task 4 Step 2.
- El cuarto parámetro de `toListItem` y `toTenantDetail` se agrega en el Step 5 y se pasa en los Steps 3 y 4.

## Manual de QA — por qué este plan no lo lleva

Esta HU es fullstack, y el precedente del repo es **un solo manual por historia, del lado donde está la superficie de usuario**:

- `mrr-actual-neto-y-proyectado` (fullstack, plan en ambos repos) produjo **solo** `…-qa-flujo.md` en el landlord; su plan de API no lleva manual.
- `grupos-tenants-api` y `serie-mensual-mrr` (solo API) llevan `…-qa-api.md`.
- `tenant-groups-screen`, `tendencia-mensual-mrr` y `churn-y-transiciones` (solo landlord) llevan `…-qa-flujo.md`.

El recorrido por la pantalla ejercita estos endpoints de punta a punta, así que un manual de API aparte duplicaría la validación. El manual único vive en el plan del landlord (su Task 7), y **ahí** se extiende el seeder QA de este repo.

Lo que no es observable desde la pantalla se verifica en la **Task 6** de este plan, que la recorre quien implementa: el `403` del guard, la colisión de concurrencia, el conteo de consultas por página y la ausencia de migración.

## Execution Handoff

Plan completo. El plan hermano del landlord vive en `valanserh-landlord/docs/superpowers/plans/2026-09-10-asignar-tenants-grupo-landlord.md`. **Este plan va primero:** el landlord consume el contrato que aquí se publica, y su Task 7 es la dueña del único manual de QA de la historia.
