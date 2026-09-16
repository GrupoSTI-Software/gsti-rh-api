# Concentración de MRR por grupo económico (API) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `GET /api/platform/metrics/mrr` publique, junto a las cifras que ya devuelve, el reparto del MRR actual neto entre grupos económicos y una única bolsa "Sin grupo", de modo que la suma de los importes del reparto sea **exactamente** `mrrActualNetoCents`.

**Architecture:** No hay endpoint nuevo ni archivo de rutas nuevo. Se edita `platform_mrr_service.ts`: la consulta del universo `active` deja de ser un `SUM` global y pasa a ser **un solo `SUM` agrupado** por grupo económico (dos `LEFT JOIN` al pivote y a grupos, con el filtro de baja lógica del grupo **en el `ON`**); de esas mismas filas se plegan en JavaScript las tres lecturas: el total, su conteo y el desglose. El armado del desglose (participaciones, omisión de ceros, orden) vive en una función **pura** exportada, con su prueba unitaria Japa. El controlador solo suma documentación.

**Tech Stack:** AdonisJS 6 + Lucid (MySQL 8), Knex crudo para las consultas de plataforma, Japa (`node ace test unit`), TypeScript estricto (cero `any`).

## Global Constraints

- Todo el código, comentarios y documentación en español, excepto nombres de variables, funciones, clases y métodos (en inglés), palabras reservadas y nombres de librerías.
- Sin emojis en código, comentarios ni documentación.
- **Ninguna migración, ningún modelo nuevo, ninguna columna nueva.** Las tablas de grupos ya existen (verificado: `database/migrations/1788282413067000_create_platform_tenant_groups_table.ts` y `1788282413067001_create_platform_tenant_group_members_table.ts`). Esta rebanada las lee.
- **No se crea endpoint.** `start/routes.ts` y `start/routes/platform_mrr_routes.ts` **no se tocan**: verificar en el diff del PR que no aparecen.
- **Cero códigos de error nuevos.** La superficie `PLT.MET.*` (`app/constants/platform_metric_error_codes.ts`) se consume tal cual: el desglose no recibe entrada y no tiene modo de falla propio. No hay 422 en este endpoint.
- **El neto no se redefine.** Se lee `billing_subscription_contracted_subtotal` (columna congelada, en pesos) con `CONTRACTED_SUBTOTAL_CENTS_SQL`, que ya existe en el servicio. Si en el diff aparece `billing_subscription_discount_percent`, está mal.
- **Sufijo `Cents` obligatorio** en todo campo de dinero. `participacionPct` no lo lleva porque no es dinero.
- `deleted_at IS NULL` explícito sobre **cada** tabla de la consulta (suscripciones, unidades de negocio y grupos): las queries crudas de Knex no pasan por el hook de `SoftDeletes`.
- Ningún modelo Lucid se serializa: prohibido `.serialize()`, `.toJSON()` y `{ ...modelo }`. DTO plano a mano sobre un `select` que nombra columnas.
- **La respuesta no publica identidad de clientes:** ni `businessUnitPublicId`, ni `business_unit_id`, ni nombre de empresa. Solo grupos, la bolsa "Sin grupo" y conteos.
- `platform_tenant_group_active = 0` **no excluye**: un grupo apagado con clientes activos sigue concentrando ingreso.
- TypeScript estricto, cero `any`; interfaces de retorno exportadas arriba del servicio, con JSDoc en español y sin `@example`.
- Documentación duplicada obligatoria en el controlador: bloque `@swagger` **y** anotaciones AdonisJS (`@index`, `@responseBody`), ambas en español.
- Commits en Conventional Commits con descripción en español (ej. `feat: Publicar la concentracion de MRR por grupo economico`).
- Rama de trabajo: `feature/USRH1788052455659-concentracion-mrr-grupo` (ya existe). Target del PR: `feature/USRH1788052455658-tenants-agrupados-sueltos`.

---

## Hallazgos de validación del spec (leer antes de empezar)

El spec es hipótesis sobre `valanserh-api@c0eb63a6`. Se validó contra la rama `feature/USRH1788052455659-concentracion-mrr-grupo` del repo **`gsti-rh-api`** (el spec lo llama `valanserh-api`; es el mismo repo). Resultado:

| Anclaje del spec | Estado | Consecuencia |
|---|---|---|
| `platform_mrr_service.ts` con universo aislado en `mrrBaseQuery()` y proyección en `getMrrSnapshot()` | **Confirmado** (`:348-353` y `:320-335`) | Se agrega el `groupBy` sobre ese mismo universo |
| `CONTRACTED_SUBTOTAL_CENTS_SQL` y `MRR_STATUSES` compartidos | **Confirmado** (`:260-264`) | Se reutiliza la expresión tal cual |
| Tablas de grupos con `UNIQUE(business_unit_id)` en el pivote y soft delete solo en el grupo | **Confirmado** (migraciones `…067000` y `…067001`) | No hace falta desempatar membresías en el servicio; el pivote **no** tiene `deleted_at` |
| `idx_platform_tenant_group_member_group` previsto para este desglose | **Confirmado** (comentario literal en la migración) | El `GROUP BY` ya tiene índice |
| Patrón de "consulta auxiliar plegada en un mapa" | **Confirmado** en `platform_tenant_service.ts:495-530` (`loadTenantGroupMap`) | Es el molde del `LEFT JOIN` y del filtro `deleted_at` |
| Superficie de errores `PLT.MET.*` con `MRR_METRIC_ERROR_TEXTS` | **Confirmado** (`app/constants/platform_metric_error_codes.ts:55-60`) | Cero códigos nuevos |
| El spec dice que el 500 sale con `title: 'No fue posible obtener el MRR'` y `key: 'no-fue-posible-obtener-el-mrr'` | **Drift trivial** | El catálogo vigente emite `title: 'Error inesperado al obtener el ingreso mensual recurrente'` y `key: 'error-inesperado-al-obtener-el-ingreso-mensual-recurrente'` con `code: PLT.MET.SYS_UNHANDLED`. **Gana el código vigente**; no se renombra nada por un ejemplo del spec |
| El spec habla de "consulta auxiliar" para el desglose, y a la vez exige "misma pasada, mismo corte" y que las dos cifras "salgan de la misma consulta" | **Contradicción resuelta abajo** | Ver la decisión declarada |

### Decisión declarada: una sola consulta, no dos (confirmar con Wilvardo en la revisión del PR)

El spec pide dos cosas que no caben juntas: una *consulta auxiliar* para el desglose (§Enfoque) y que el total y el desglose *salgan de la misma consulta y del mismo corte* (Contrato de API, regla 1; HU, regla 6).

**Este plan implementa la segunda**, que es la que sostiene CA-3: la consulta del universo `active` se agrupa por grupo económico y de **esas mismas filas** se derivan `mrrActualNetoCents`, `suscripcionesActivas` y `concentracion.unidades`. Con dos consultas separadas, una suscripción que se active entre la primera y la segunda haría que la suma del desglose difiera del total — el peor defecto posible de esta HU, y uno que ninguna prueba de hoy atraparía.

Lo que **no** cambia con esta decisión: el universo (`mrrBaseQuery()`), el filtro de estado (`'active'`), la expresión del neto (`CONTRACTED_SUBTOTAL_CENTS_SQL`) y la regla de no colapsar por tenant. Lo único que cambia es que el `SUM` sale agrupado y se vuelve a plegar en JavaScript sobre enteros (exacto: son centavos enteros, muy por debajo de `Number.MAX_SAFE_INTEGER`).

`loadStatusTotals('trialing')` se queda intacta: el proyectado de pruebas **no** entra al reparto (regla 8) y por eso conserva su propia consulta con su propio filtro.

La Task 4, paso 2 compara el total nuevo contra el `SUM` global de la consulta anterior sobre los datos reales. Si Wilvardo prefiere volver a dos consultas, el cambio es local a `getMrrSnapshot` y a `loadConcentrationRows`.

### Gotcha que decide CA-4 (leerlo dos veces)

El filtro de la baja lógica del grupo va **en el `ON` del `LEFT JOIN`**, nunca en el `WHERE`:

```sql
left join platform_tenant_groups as g
  on g.platform_tenant_group_id = m.platform_tenant_group_id
 and g.platform_tenant_group_deleted_at is null
```

Con `whereNull('g.platform_tenant_group_deleted_at')` el efecto es otro y es catastrófico en silencio: las filas sin membresía pasan (su `g.*` es `NULL`, así que `IS NULL` es verdadero), pero las filas cuyo grupo fue dado de baja **se eliminan del resultado**. El ingreso de esos clientes desaparecería del desglose sin desaparecer del total, y CA-4 fallaría sin que nada truene. El `SQL` generado se verificó al escribir este plan: la forma de arriba es la que produce Knex con `andOnNull`.

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `app/services/platform_mrr_service.ts` (edit) | Tipos del desglose, la pura `buildMrrConcentration`, la consulta agrupada `loadConcentrationRows`, el conteo `countLiveTenantGroups` y el plegado en `getMrrSnapshot` |
| `app/controllers/platform_mrr_controller.ts` (edit) | Documentación `@swagger` + `@responseBody` de la sección `concentracion`. Cero lógica nueva |
| `tests/unit/services/platform_mrr_concentration.spec.ts` (create) | Prueba unitaria de la pura: cuadre, participaciones, omisión de ceros, orden, bolsa única |
| `database/seeders/_tmp_do_not_commit_qa_seeder.ts` (edit, **no versionado**) | Un grupo vivo sin clientes activos, para hacer observable `gruposOmitidosSinMrr` |

**Contrato publicado por esta HU:**

```
GET /api/platform/metrics/mrr   — existente, se EXTIENDE. Sin query params, sin params de ruta.

200 → { "type": "success", "data": {
         "mrrActualNetoCents": 325000,        // sin cambio de nombre, tipo ni significado
         "suscripcionesActivas": 5,           // idem
         "mrrProyectadoTrialCents": 65000,    // idem — NO se reparte
         "suscripcionesEnPrueba": 1,          // idem
         "monedas": [ { "codigo": "MXN", "suscripciones": 6 } ],
         "concentracion": {
           "base": "mrr-actual-neto",
           "unidades": [
             { "tipo": "grupo", "platformTenantGroupId": 7, "nombre": "QA-DBG-Manny",
               "tenants": 2, "mrrNetoCents": 130000, "participacionPct": 40.0 },
             { "tipo": "sin-grupo", "platformTenantGroupId": null, "nombre": "Sin grupo",
               "tenants": 2, "mrrNetoCents": 130000, "participacionPct": 40.0 },
             { "tipo": "grupo", "platformTenantGroupId": 9, "nombre": "QA-DBG-Apagado",
               "tenants": 1, "mrrNetoCents": 65000, "participacionPct": 20.0 }
           ],
           "gruposOmitidosSinMrr": 1
         },
         "calculadoAl": "2026-09-11"
       } }
403 → { title, detail, key: 'AUTH.PLATFORM.FORBIDDEN' }   // del guard, sin campo `code`
500 → { title: 'Error inesperado al obtener el ingreso mensual recurrente',
        detail, key: 'error-inesperado-al-obtener-el-ingreso-mensual-recurrente',
        code: 'PLT.MET.SYS_UNHANDLED' }

Invariante duro: SUM(concentracion.unidades[].mrrNetoCents) === mrrActualNetoCents, exacto, sin tolerancia.
```

---

### Task 1: La pura del reparto (tipos + `buildMrrConcentration`)

Toda la aritmética y todas las reglas de presentación del reparto viven en una función pura, fuera de la base de datos: es lo único de esta HU que se puede probar sin ambiente y es donde se rompería CA-3 o CA-5 si alguien "arregla" el redondeo.

**Files:**
- Modify: `app/services/platform_mrr_service.ts` (bloque de tipos, arriba; y la pura junto al núcleo puro de la serie)
- Test: `tests/unit/services/platform_mrr_concentration.spec.ts`

**Interfaces:**
- Consumes: nada. Es la primera pieza y no toca la base.
- Produces: `MrrConcentrationUnitKind`, `MrrConcentrationRow`, `MrrConcentrationUnit`, `MrrConcentration`, `MrrConcentrationTotals`, `SIN_GRUPO_NOMBRE` y `buildMrrConcentration(rows, liveGroupsCount): MrrConcentrationTotals`. Los consume la Task 2; `MrrConcentration` entra además en `PlatformMrrSnapshot`.

- [ ] **Step 1: Write the failing test**

Crear `tests/unit/services/platform_mrr_concentration.spec.ts` (molde: `tests/unit/services/platform_mrr_series.spec.ts`, mismo estilo de `test.group` y nombres en español):

```typescript
import { test } from '@japa/runner'
import {
  buildMrrConcentration,
  SIN_GRUPO_NOMBRE,
  type MrrConcentrationRow,
} from '#services/platform_mrr_service'

/**
 * USRH1788052455659 — reglas del reparto del MRR actual neto entre grupos.
 *
 * La pura recibe las filas ya agrupadas por la base y el conteo de grupos vivos,
 * así que estas pruebas son deterministas: no tocan MySQL ni el reloj. Lo que
 * depende de la base —el universo, los `LEFT JOIN` y la baja lógica del grupo—
 * se verifica contra el servidor en la Task 4.
 */

function fila(overrides: Partial<MrrConcentrationRow> = {}): MrrConcentrationRow {
  return {
    platformTenantGroupId: 7,
    nombre: 'Grupo Norte',
    tenants: 1,
    suscripciones: 1,
    mrrNetoCents: 100_000,
    ...overrides,
  }
}

test.group('buildMrrConcentration', () => {
  test('CA-3 — la suma de las unidades es exactamente el total, sin tolerancia', ({ assert }) => {
    const { concentracion, netoCents } = buildMrrConcentration(
      [
        fila({ platformTenantGroupId: 7, nombre: 'Grupo Norte', mrrNetoCents: 130_001 }),
        fila({ platformTenantGroupId: 9, nombre: 'Grupo Sur', mrrNetoCents: 65_003 }),
        fila({ platformTenantGroupId: null, nombre: null, mrrNetoCents: 129_999, tenants: 2 }),
      ],
      2
    )

    const suma = concentracion.unidades.reduce((acc, u) => acc + u.mrrNetoCents, 0)

    assert.equal(suma, netoCents)
    assert.equal(netoCents, 325_003)
  })

  test('CA-2 — los clientes sin grupo son una sola unidad llamada Sin grupo, sin identidad de clientes', ({
    assert,
  }) => {
    const { concentracion } = buildMrrConcentration(
      [fila({ platformTenantGroupId: null, nombre: null, tenants: 3, suscripciones: 4, mrrNetoCents: 90_000 })],
      0
    )

    assert.lengthOf(concentracion.unidades, 1)
    const unidad = concentracion.unidades[0]!
    assert.equal(unidad.tipo, 'sin-grupo')
    assert.equal(unidad.nombre, SIN_GRUPO_NOMBRE)
    assert.isNull(unidad.platformTenantGroupId)
    assert.equal(unidad.tenants, 3)
    assert.deepEqual(Object.keys(unidad).sort(), [
      'mrrNetoCents',
      'nombre',
      'participacionPct',
      'platformTenantGroupId',
      'tenants',
      'tipo',
    ])
  })

  test('CA-5 — la participación se deriva del importe, a un decimal, y no se fuerza el 100', ({
    assert,
  }) => {
    const { concentracion } = buildMrrConcentration(
      [
        fila({ platformTenantGroupId: 7, nombre: 'A', mrrNetoCents: 100_000 }),
        fila({ platformTenantGroupId: 8, nombre: 'B', mrrNetoCents: 100_000 }),
        fila({ platformTenantGroupId: 9, nombre: 'C', mrrNetoCents: 100_000 }),
      ],
      3
    )

    const pcts = concentracion.unidades.map((u) => u.participacionPct)

    assert.deepEqual(pcts, [33.3, 33.3, 33.3])
    assert.notEqual(
      pcts.reduce((a, b) => a + b, 0),
      100
    )
  })

  test('regla 8 del contrato — orden por importe descendente, desempate por nombre ascendente', ({
    assert,
  }) => {
    const { concentracion } = buildMrrConcentration(
      [
        fila({ platformTenantGroupId: 7, nombre: 'Zeta', mrrNetoCents: 50_000 }),
        fila({ platformTenantGroupId: null, nombre: null, mrrNetoCents: 200_000 }),
        fila({ platformTenantGroupId: 8, nombre: 'Alfa', mrrNetoCents: 50_000 }),
      ],
      2
    )

    assert.deepEqual(
      concentracion.unidades.map((u) => u.nombre),
      [SIN_GRUPO_NOMBRE, 'Alfa', 'Zeta']
    )
  })

  test('CA-10 — las unidades sin ingreso no se listan y se informa cuántos grupos quedaron fuera', ({
    assert,
  }) => {
    const { concentracion } = buildMrrConcentration(
      [
        fila({ platformTenantGroupId: 7, nombre: 'Con ingreso', mrrNetoCents: 100_000 }),
        fila({ platformTenantGroupId: 8, nombre: 'Sin ingreso', mrrNetoCents: 0, suscripciones: 0, tenants: 0 }),
      ],
      4
    )

    assert.lengthOf(concentracion.unidades, 1)
    assert.equal(concentracion.unidades[0]!.nombre, 'Con ingreso')
    assert.equal(concentracion.gruposOmitidosSinMrr, 3)
  })

  test('regla 7 del contrato — la bolsa Sin grupo también se omite cuando su importe es cero', ({
    assert,
  }) => {
    const { concentracion } = buildMrrConcentration(
      [
        fila({ platformTenantGroupId: 7, nombre: 'Único', mrrNetoCents: 100_000 }),
        fila({ platformTenantGroupId: null, nombre: null, mrrNetoCents: 0, suscripciones: 0, tenants: 0 }),
      ],
      1
    )

    assert.lengthOf(concentracion.unidades, 1)
    assert.equal(concentracion.unidades[0]!.tipo, 'grupo')
  })

  test('CA-7 — un solo grupo con todo el ingreso sale al 100.0 y es resultado válido', ({
    assert,
  }) => {
    const { concentracion } = buildMrrConcentration(
      [fila({ platformTenantGroupId: 7, nombre: 'Único', mrrNetoCents: 480_000, tenants: 3 })],
      1
    )

    assert.lengthOf(concentracion.unidades, 1)
    assert.equal(concentracion.unidades[0]!.participacionPct, 100)
    assert.equal(concentracion.gruposOmitidosSinMrr, 0)
  })

  test('CA-9 — sin suscripciones activas el reparto llega vacío y no hay división entre cero', ({
    assert,
  }) => {
    const { concentracion, netoCents, suscripciones } = buildMrrConcentration([], 2)

    assert.deepEqual(concentracion.unidades, [])
    assert.equal(concentracion.gruposOmitidosSinMrr, 2)
    assert.equal(netoCents, 0)
    assert.equal(suscripciones, 0)
  })

  test('el total y el conteo se plegan de las mismas filas del desglose', ({ assert }) => {
    const { netoCents, suscripciones } = buildMrrConcentration(
      [
        fila({ platformTenantGroupId: 7, nombre: 'A', suscripciones: 3, mrrNetoCents: 100_000 }),
        fila({ platformTenantGroupId: null, nombre: null, suscripciones: 2, mrrNetoCents: 50_000 }),
      ],
      1
    )

    assert.equal(netoCents, 150_000)
    assert.equal(suscripciones, 5)
  })

  test('el desglose nunca publica identidad de clientes', ({ assert }) => {
    const { concentracion } = buildMrrConcentration(
      [fila({ platformTenantGroupId: null, nombre: null, tenants: 2, mrrNetoCents: 10_000 })],
      0
    )

    const json = JSON.stringify(concentracion)

    assert.notInclude(json, 'businessUnit')
    assert.notInclude(json, 'business_unit')
  })

  test('base declara sobre qué cifra se reparte', ({ assert }) => {
    const { concentracion } = buildMrrConcentration([fila()], 1)

    assert.equal(concentracion.base, 'mrr-actual-neto')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ace test unit --files=platform_mrr_concentration`
Expected: FAIL — no exporta `buildMrrConcentration` desde `#services/platform_mrr_service` (error de compilación del import).

- [ ] **Step 3: Write minimal implementation**

En `app/services/platform_mrr_service.ts`, agregar los tipos **dentro del bloque `─── Tipos de retorno ───`**, justo después de `MrrCurrencySlice` y **antes** de `PlatformMrrSnapshot` (que los usa):

```typescript
/** Qué es una unidad del reparto: un grupo económico, o la bolsa de los que no tienen. */
export type MrrConcentrationUnitKind = 'grupo' | 'sin-grupo'

/**
 * Fila del desglose tal como la devuelve la base: ya agregada por grupo, con el
 * grupo en `null` cuando la suscripción no pertenece a ninguno vivo.
 *
 * Es la frontera entre SQL y la pura: la consulta agrupa y suma, la pura nombra,
 * ordena y calcula participaciones.
 */
export interface MrrConcentrationRow {
  /** `null` = sin membresía, o membresía apuntando a un grupo dado de baja. */
  platformTenantGroupId: number | null
  /** Nombre del grupo; `null` en la fila de los que no tienen grupo. */
  nombre: string | null
  /** Clientes distintos con MRR activo dentro de la unidad. */
  tenants: number
  /** Suscripciones activas de la unidad. No colapsa por cliente (regla 5 de la orden 8). */
  suscripciones: number
  /** Suma del subtotal congelado de la unidad, en centavos. */
  mrrNetoCents: number
}

/** Una unidad del reparto, ya nombrada y con su participación derivada. */
export interface MrrConcentrationUnit {
  tipo: MrrConcentrationUnitKind
  /** `null` cuando `tipo = 'sin-grupo'`. */
  platformTenantGroupId: number | null
  /** Nombre del grupo, o el nombre único de la bolsa. */
  nombre: string
  tenants: number
  mrrNetoCents: number
  /** Parte del total que le toca, con un decimal. Se deriva del importe, nunca al revés. */
  participacionPct: number
}

/**
 * Reparto del MRR actual neto entre grupos económicos.
 *
 * `base` declara en el propio payload sobre qué cifra se reparte, para que nadie
 * lo confunda con el proyectado de pruebas, que **no** se reparte (regla 8).
 */
export interface MrrConcentration {
  base: 'mrr-actual-neto'
  /** Ordenadas por importe descendente, desempate por nombre. Vacío si no hay MRR activo. */
  unidades: MrrConcentrationUnit[]
  /** Grupos vivos que no listaron unidad por no tener MRR activo (regla 9). */
  gruposOmitidosSinMrr: number
}

/**
 * Las tres lecturas del universo `active`, plegadas de las mismas filas.
 *
 * Viajan juntas a propósito: que el total salga del mismo pliegue que el
 * desglose es lo que hace imposible que difieran (CA-3).
 */
export interface MrrConcentrationTotals {
  concentracion: MrrConcentration
  netoCents: number
  suscripciones: number
}
```

Agregar el campo a `PlatformMrrSnapshot`, entre `monedas` y `calculadoAl`:

```typescript
  /**
   * Reparto del actual neto por grupo económico. `SUM(unidades[].mrrNetoCents)`
   * es exactamente `mrrActualNetoCents`: las dos cifras se pliegan de la misma
   * consulta (USRH1788052455659).
   */
  concentracion: MrrConcentration
```

Y la pura, en una sección nueva **antes** de `─── SQL compartido ───`:

```typescript
// ─── Núcleo del reparto por grupo (puro) ──────────────────────────────────────

/**
 * Nombre único de la bolsa que agrupa a los clientes sin grupo económico.
 *
 * Lo emite el servicio y no la vista, para que sea uno solo y traducible en un
 * solo lugar (regla 5 del contrato).
 */
export const SIN_GRUPO_NOMBRE = 'Sin grupo'

/**
 * Arma el reparto y, de las mismas filas, el total y el conteo del universo activo.
 *
 * Es puro: no consulta, no lee el reloj y no toca `db`. Tres reglas que se
 * prestan a que alguien las "corrija":
 *
 * 1. **El total se pliega de estas filas**, no de una segunda consulta. Es lo
 *    que vuelve imposible que la suma del desglose difiera de la cifra de la
 *    franja (CA-3). Si algún día alguien recalcula el total aparte, el
 *    invariante pasa a depender de la suerte.
 * 2. **La participación se deriva del importe**, redondeada a un decimal, y la
 *    suma de porcentajes **puede no dar 100.0**. No se ajusta ninguna unidad:
 *    forzar el cuadre falsearía un dato para maquillar un redondeo (CA-5).
 * 3. **Las unidades en cero no se listan** y se informa cuántos grupos quedaron
 *    fuera por eso (regla 9). La bolsa "Sin grupo" se omite igual si vale cero.
 *
 * @param rows - Filas ya agrupadas por grupo económico, con el nulo como bolsa.
 * @param liveGroupsCount - Grupos vivos en la plataforma, para el conteo de omitidos.
 * @returns El reparto, el total en centavos y el conteo de suscripciones activas.
 */
export function buildMrrConcentration(
  rows: MrrConcentrationRow[],
  liveGroupsCount: number
): MrrConcentrationTotals {
  const netoCents = rows.reduce((total, row) => total + row.mrrNetoCents, 0)
  const suscripciones = rows.reduce((total, row) => total + row.suscripciones, 0)

  const unidades: MrrConcentrationUnit[] = rows
    .filter((row) => row.mrrNetoCents > 0)
    .map((row) => {
      const esGrupo = row.platformTenantGroupId !== null

      return {
        tipo: esGrupo ? ('grupo' as const) : ('sin-grupo' as const),
        platformTenantGroupId: row.platformTenantGroupId,
        // El nombre nulo de un grupo no existe (la columna es NOT NULL), pero el
        // fallback evita publicar una cadena vacía si algún día lo fuera.
        nombre: esGrupo ? (row.nombre ?? SIN_GRUPO_NOMBRE) : SIN_GRUPO_NOMBRE,
        tenants: row.tenants,
        mrrNetoCents: row.mrrNetoCents,
        // Guarda explícita de la división entre cero: con total en cero no hay
        // unidades que listar, así que esta rama no se alcanza desde el endpoint.
        participacionPct:
          netoCents > 0 ? Math.round((row.mrrNetoCents / netoCents) * 1000) / 10 : 0,
      }
    })
    .sort(
      (a, b) => b.mrrNetoCents - a.mrrNetoCents || a.nombre.localeCompare(b.nombre, 'es')
    )

  const gruposListados = unidades.filter((unidad) => unidad.tipo === 'grupo').length

  return {
    concentracion: {
      base: 'mrr-actual-neto',
      unidades,
      // `Math.max` porque el conteo de grupos vivos y el desglose son dos
      // lecturas: una alta entre ambas no puede producir un negativo.
      gruposOmitidosSinMrr: Math.max(liveGroupsCount - gruposListados, 0),
    },
    netoCents,
    suscripciones,
  }
}
```

> **Ojo con el orden de `sort`:** `localeCompare(…, 'es')` solo entra como desempate. "Sin grupo" **no** se fija al final: compite por importe como cualquier unidad, porque su peso es parte de la lectura (regla 8 del contrato).

- [ ] **Step 4: Run test to verify it passes**

Run: `node ace test unit --files=platform_mrr_concentration`
Expected: PASS, 11 pruebas.

Después, verificar que no se rompió la pura vecina:

Run: `node ace test unit --files=platform_mrr_series`
Expected: PASS, 18 pruebas.

- [ ] **Step 5: Verificar tipos**

```bash
npx tsc --noEmit
```

Expected: **FALLA esperada** en `getMrrSnapshot`, porque `PlatformMrrSnapshot` ya exige `concentracion` y el servicio todavía no lo devuelve. Es la señal de que el tipo manda; lo resuelve la Task 2. Si no falla, el campo quedó opcional por error: quitarle el `?`.

- [ ] **Step 6: Commit**

```bash
git add app/services/platform_mrr_service.ts tests/unit/services/platform_mrr_concentration.spec.ts
git commit -m "feat: Agregar el nucleo puro del reparto de MRR por grupo economico"
```

---

### Task 2: La consulta agrupada y el plegado en el snapshot

**Files:**
- Modify: `app/services/platform_mrr_service.ts` (métodos privados nuevos y `getMrrSnapshot`)

**Interfaces:**
- Consumes: `buildMrrConcentration`, `MrrConcentrationRow`, `MrrConcentrationTotals` de la Task 1; `mrrBaseQuery()`, `CONTRACTED_SUBTOTAL_CENTS_SQL` y `loadStatusTotals` que ya existen.
- Produces: `getMrrSnapshot()` devolviendo `PlatformMrrSnapshot` con `concentracion`. Lo consume el controlador (Task 3) y el landlord.

- [ ] **Step 1: Agregar los dos métodos privados de lectura**

En la clase `PlatformMrrService`, justo después de `loadStatusTotals` y antes de `loadCurrencies`:

```typescript
  /**
   * Universo `active` agregado por grupo económico, en **una sola** consulta.
   *
   * Es la misma pasada que produce la cifra de la franja: el universo
   * (`mrrBaseQuery`), el filtro de estado y la expresión del neto son los de la
   * orden 8, y lo único que se agrega es el `GROUP BY`. Por eso
   * `SUM(unidades) === mrrActualNetoCents` es invariante por construcción y no
   * por coincidencia (CA-3).
   *
   * Los dos `LEFT JOIN` no pueden perder ni duplicar filas: el pivote tiene
   * `UNIQUE(business_unit_id)` —a lo más un grupo por cliente— y el segundo une
   * por llave primaria.
   *
   * **El filtro de la baja lógica del grupo va en el `ON`, no en el `WHERE`.**
   * En el `WHERE`, `g.platform_tenant_group_deleted_at IS NULL` dejaría pasar a
   * los sin membresía (su `g.*` llega nulo) pero **borraría del resultado** a los
   * clientes cuyo grupo fue dado de baja: su ingreso desaparecería del desglose
   * sin desaparecer del total y CA-4 fallaría en silencio. En el `ON`, esa
   * membresía huérfana cae en la bolsa "sin-grupo", que es la regla 4.
   *
   * `platform_tenant_group_active` **no** filtra: un grupo apagado con clientes
   * activos sigue concentrando ingreso (regla 4 del contrato).
   *
   * @returns Una fila por grupo con MRR, más la fila del nulo con todos los demás.
   */
  private async loadConcentrationRows(): Promise<MrrConcentrationRow[]> {
    const rows = (await this.mrrBaseQuery()
      .where('bs.billing_subscription_status', 'active')
      .leftJoin(
        'platform_tenant_group_members as m',
        'm.business_unit_id',
        'bs.business_unit_id'
      )
      .leftJoin('platform_tenant_groups as g', (join) => {
        join
          .on('g.platform_tenant_group_id', '=', 'm.platform_tenant_group_id')
          .andOnNull('g.platform_tenant_group_deleted_at')
      })
      .select('g.platform_tenant_group_id as platformTenantGroupId')
      .select('g.platform_tenant_group_name as nombre')
      .select(db.raw('COUNT(DISTINCT bs.business_unit_id) as tenants'))
      .select(db.raw('COUNT(*) as suscripciones'))
      .select(db.raw(`COALESCE(SUM(${CONTRACTED_SUBTOTAL_CENTS_SQL}), 0) as mrrNetoCents`))
      .groupBy('g.platform_tenant_group_id', 'g.platform_tenant_group_name')) as Array<
      Record<string, unknown>
    >

    return rows.map((row) => ({
      platformTenantGroupId:
        row.platformTenantGroupId === null ? null : Number(row.platformTenantGroupId),
      nombre: row.nombre === null ? null : String(row.nombre),
      tenants: Number(row.tenants ?? 0),
      suscripciones: Number(row.suscripciones ?? 0),
      // `SUM()` sobre DECIMAL llega como string por Knex: el Number va explícito.
      mrrNetoCents: Number(row.mrrNetoCents ?? 0),
    }))
  }

  /**
   * Cuántos grupos económicos vivos hay en la plataforma.
   *
   * Sirve solo para `gruposOmitidosSinMrr`: es un conteo de catálogo, no de
   * dinero, así que va aparte sin tocar el invariante del cuadre. Un grupo que no
   * aparece en el desglose es un grupo sin MRR activo, y esta cifra dice cuántos
   * son en lugar de dejar la ausencia sin explicación (regla 9).
   *
   * `deleted_at IS NULL` explícito: la consulta cruda no pasa por `SoftDeletes`.
   *
   * @returns Total de grupos sin baja lógica, activos o apagados.
   */
  private async countLiveTenantGroups(): Promise<number> {
    const row = (await db
      .from('platform_tenant_groups')
      .whereNull('platform_tenant_group_deleted_at')
      .count('* as total')
      .first()) as Record<string, unknown> | null

    return Number(row?.total ?? 0)
  }
```

- [ ] **Step 2: Plegar las tres lecturas en `getMrrSnapshot`**

Reemplazar el cuerpo del método (conserva la lectura única del reloj) y su JSDoc:

```typescript
  /**
   * Las dos cifras de ingreso recurrente y el reparto del actual, al momento.
   *
   * Una sola lectura del reloj para todas las consultas: el actual, el
   * proyectado, el reparto y las monedas tienen que hablar del mismo día aunque
   * el proceso cruce la medianoche.
   *
   * El actual neto, su conteo y el desglose salen del **mismo** pliegue de la
   * misma consulta agrupada (`loadConcentrationRows`). No hay una segunda
   * consulta del total: si la hubiera, una suscripción activada entre las dos
   * haría que la suma del desglose difiriera de la cifra de la franja, que es el
   * peor defecto posible de esta lectura (CA-3).
   *
   * El proyectado de pruebas conserva su propia consulta: **no** se reparte
   * (regla 8) y comparte cero ramificación con el actual.
   *
   * @returns Actual neto, proyectado, sus conteos, monedas, el reparto y la fecha.
   */
  async getMrrSnapshot(): Promise<PlatformMrrSnapshot> {
    const businessDate = toBusinessDateString()

    const concentrationRows = await this.loadConcentrationRows()
    const gruposVivos = await this.countLiveTenantGroups()
    const activas: MrrConcentrationTotals = buildMrrConcentration(concentrationRows, gruposVivos)

    const enPrueba = await this.loadStatusTotals('trialing')
    const monedas = await this.loadCurrencies()

    return {
      mrrActualNetoCents: activas.netoCents,
      suscripcionesActivas: activas.suscripciones,
      mrrProyectadoTrialCents: enPrueba.netoCents,
      suscripcionesEnPrueba: enPrueba.suscripciones,
      monedas,
      concentracion: activas.concentracion,
      calculadoAl: businessDate,
    }
  }
```

- [ ] **Step 3: Ajustar el JSDoc de `loadStatusTotals` y el de la clase**

`loadStatusTotals` ya no atiende a los dos estados. Cambiar su primer párrafo por:

```typescript
  /**
   * Suma del subtotal congelado y conteo de suscripciones de un estado.
   *
   * Hoy la usa solo el proyectado de pruebas: el actual neto se pliega del
   * desglose por grupo, que sale de la misma consulta agrupada
   * (`loadConcentrationRows`). Se conserva genérica a propósito —recibe el
   * estado por parámetro— porque es la forma que garantiza que el proyectado
   * jamás comparta una ramificación con el actual (regla 3).
   *
   * `COALESCE` porque MySQL devuelve NULL —no 0— cuando el universo está vacío,
   * y `Number(...)` porque `SUM()` sobre `DECIMAL` llega como string por Knex.
   *
   * @param status - Estado exacto de las suscripciones a sumar.
   * @returns Importe neto en centavos y cuántas suscripciones lo produjeron.
   */
```

Y en el JSDoc de la clase, sustituir la sección `## Forma pensada para la orden 16` por:

```typescript
 * ## Reparto por grupo económico (orden 16, USRH1788052455659)
 *
 * El universo y sus filtros (`mrrBaseQuery`) siguen aislados de la proyección.
 * La orden 16 los aprovechó agregando un `GROUP BY` **sobre la misma pasada**:
 * el actual neto, su conteo y el desglose se pliegan de una sola consulta, así
 * que la suma del desglose es igual a la cifra de la franja por construcción.
 * Ese es el invariante que define la lectura: dos consultas con dos cortes lo
 * romperían aunque los números coincidieran hoy.
```

- [ ] **Step 4: Verificar tipos y lint**

```bash
npx tsc --noEmit && pnpm lint
```

Expected: sin errores (la falla esperada de la Task 1 ya quedó resuelta).

- [ ] **Step 5: Correr la unitaria de la pura otra vez**

Run: `node ace test unit --files=platform_mrr`
Expected: PASS — las 11 del reparto y las 18 de la serie.

- [ ] **Step 6: Commit**

```bash
git add app/services/platform_mrr_service.ts
git commit -m "feat: Resolver el reparto de MRR por grupo en la misma consulta del total"
```

---

### Task 3: Documentar la sección nueva en el controlador

Cero lógica: `index` no cambia una línea de código. Lo que cambia es la documentación, y en este repo es obligatoria por duplicado.

**Files:**
- Modify: `app/controllers/platform_mrr_controller.ts`

**Interfaces:**
- Consumes: el payload de `getMrrSnapshot` (Task 2).
- Produces: nada de código. Documentación del contrato.

- [ ] **Step 1: Agregar `concentracion` al bloque `@swagger` de `index`**

Dentro de `responses.'200'.content.application/json.schema.properties.data.properties`, después de `monedas` y antes de `calculadoAl`:

```yaml
   *                     concentracion:
   *                       type: object
   *                       description: |
   *                         Reparto del ingreso mensual recurrente actual neto entre grupos
   *                         económicos. La suma de los importes de todas las unidades es
   *                         EXACTAMENTE mrrActualNetoCents: las dos cifras se calculan en la
   *                         misma consulta y sobre el mismo corte, así que cuadran por
   *                         construcción. La suma de los porcentajes puede no dar 100.0 por el
   *                         redondeo a un decimal y eso es correcto: lo que cuadra es el dinero.
   *                         El proyectado de las suscripciones en prueba NO entra en el reparto.
   *                         Es un agregado: no publica identificadores ni nombres de clientes.
   *                       properties:
   *                         base:
   *                           type: string
   *                           enum: [mrr-actual-neto]
   *                           description: |
   *                             Declara en el propio payload sobre qué cifra se reparte, para que
   *                             nadie lo confunda con el proyectado de pruebas.
   *                         unidades:
   *                           type: array
   *                           description: |
   *                             Una entrada por grupo económico con ingreso activo, más una sola
   *                             entrada con todos los clientes que no pertenecen a ningún grupo.
   *                             Ordenadas por importe descendente, desempate por nombre. La
   *                             entrada Sin grupo NO se fija al final: compite por importe como
   *                             cualquier otra. Las unidades sin ingreso activo no se listan.
   *                             Llega vacío cuando no hay ninguna suscripción activa.
   *                           items:
   *                             type: object
   *                             properties:
   *                               tipo:
   *                                 type: string
   *                                 enum: [grupo, sin-grupo]
   *                               platformTenantGroupId:
   *                                 type: integer
   *                                 nullable: true
   *                                 description: null cuando tipo es sin-grupo.
   *                               nombre:
   *                                 type: string
   *                                 description: |
   *                                   Nombre del grupo económico, o "Sin grupo" en la bolsa. Es
   *                                   dato interno de GSTI y solo aparece dentro de /api/platform.
   *                                 example: Grupo Norte
   *                               tenants:
   *                                 type: integer
   *                                 description: Clientes distintos con ingreso activo dentro de la unidad.
   *                               mrrNetoCents:
   *                                 type: integer
   *                                 description: Importe de la unidad SIN IVA, en centavos.
   *                               participacionPct:
   *                                 type: number
   *                                 format: float
   *                                 description: |
   *                                   Parte del total que aporta la unidad, en por ciento con un
   *                                   decimal. Se deriva del importe, nunca al revés, y no se
   *                                   ajusta para que la suma dé 100.0.
   *                                 example: 31.4
   *                         gruposOmitidosSinMrr:
   *                           type: integer
   *                           description: |
   *                             Grupos económicos vivos que no aparecen en unidades porque no
   *                             tienen ningún cliente con suscripción activa. Se informan en vez
   *                             de ensuciar la lectura con barras en cero.
```

- [ ] **Step 2: Ampliar la descripción del `@swagger` y del `@description`**

En `description` del bloque `@swagger`, después del párrafo de `monedas`, agregar:

```
   *       concentracion reparte el actual neto entre grupos económicos, con una sola entrada
   *       que agrupa a todos los clientes sin grupo. La suma de los importes del reparto es
   *       exactamente mrrActualNetoCents porque salen de la misma consulta; la suma de los
   *       porcentajes puede no dar 100.0 por el redondeo y no se fuerza. Un grupo dado de baja
   *       no aparece: sus clientes cuentan bajo Sin grupo y su ingreso nunca sale del reparto.
   *       Un grupo apagado sí aparece, porque sigue concentrando ingreso. No hay umbrales,
   *       semáforos ni alertas de concentración.
```

Y en la anotación AdonisJS `@description`, agregar dos renglones con la continuación `\` al final:

```
   *   concentracion reparte el actual neto entre grupos económicos y una sola bolsa Sin grupo: la\
   *   suma de sus importes es exactamente mrrActualNetoCents; la de sus porcentajes puede no dar 100.
```

- [ ] **Step 3: Actualizar el `@responseBody 200`**

Reemplazar la línea completa por:

```
   * @responseBody 200 - {"type": "success", "data": {"mrrActualNetoCents": 325000, "suscripcionesActivas": 5, "mrrProyectadoTrialCents": 200000, "suscripcionesEnPrueba": 1, "monedas": [{"codigo": "MXN", "suscripciones": 6}], "concentracion": {"base": "mrr-actual-neto", "unidades": [{"tipo": "grupo", "platformTenantGroupId": 7, "nombre": "Grupo Norte", "tenants": 2, "mrrNetoCents": 130000, "participacionPct": 40.0}, {"tipo": "sin-grupo", "platformTenantGroupId": null, "nombre": "Sin grupo", "tenants": 2, "mrrNetoCents": 130000, "participacionPct": 40.0}, {"tipo": "grupo", "platformTenantGroupId": 9, "nombre": "Grupo Sur", "tenants": 1, "mrrNetoCents": 65000, "participacionPct": 20.0}], "gruposOmitidosSinMrr": 1}, "calculadoAl": "2026-09-11"}}
```

Los `@responseBody 403` y `500` **no cambian**: esta rebanada no agrega códigos de error.

- [ ] **Step 4: Verificar tipos y lint**

```bash
npx tsc --noEmit && pnpm lint
```

Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add app/controllers/platform_mrr_controller.ts
git commit -m "docs: Documentar el reparto de MRR por grupo en el endpoint de metricas"
```

---

### Task 4: Verificación integral de los criterios contra el servidor

Lo que la unitaria no puede ver: los `LEFT JOIN`, la baja lógica del grupo y el cuadre sobre datos reales. Esta tarea la recorre **quien implementa**.

**Files:** ninguno de código. Se edita el seeder QA (no versionado) para tener el caso del grupo sin clientes activos.

**Interfaces:** consume todo lo anterior; produce evidencia de CA-1 a CA-6 y CA-10.

**Preparación:** levantar el API (`node ace serve --hmr`), exportar `BASE=http://127.0.0.1:3333` y conseguir el token de un administrador de plataforma:

```bash
TOKEN=$(curl -sS -X POST "$BASE/api/platform/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"userEmail":"qa-dashboard-groups-admin@gsti-tests.local","userPassword":"password"}' \
  | jq -r '.data.token')
```

**Consultas SQL puntuales — sin cliente `mysql`:** este entorno no tiene el CLI `mysql`. Las consultas se corren con `node ace repl`, en una sola línea (el REPL no comparte `await` entre líneas):

```bash
echo "await (async () => { const db = (await import('@adonisjs/lucid/services/db')).default; const rows = await db.rawQuery(\"TU SQL AQUI\"); console.log(JSON.stringify(rows[0])); })()" | node ace repl 2>&1 | grep -v "Deprecation\|trace-deprecation\|TensorFlow\|tfjs\|====\|👋\|Type \".ls\""
```

- [ ] **Step 1: Sembrar el grupo vivo sin clientes activos (CA-10)**

En `database/seeders/_tmp_do_not_commit_qa_seeder.ts` —**el mismo archivo no versionado que ya usan los demás paneles, no crear otro**— agregar dentro de `seedDashboardGroupsQa()`, después de los dos grupos existentes:

```typescript
  // USRH1788052455659 — grupo vivo y activo SIN ninguna cuenta: hace observable
  // `gruposOmitidosSinMrr`, que de otro modo siempre saldría en cero.
  await ensureTenantGroup('QA-CON-Sin Clientes', { activo: true })
```

Correrlo:

```bash
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

- [ ] **Step 2: El total nuevo es idéntico al que daba la consulta anterior**

Es la comprobación de la decisión declarada: plegar el total del desglose **no** movió la cifra.

```bash
curl -s "$BASE/api/platform/metrics/mrr" -H "Authorization: Bearer $TOKEN" \
  | jq '{total: .data.mrrActualNetoCents, activas: .data.suscripcionesActivas}'
```

Y el `SUM` global de antes, tal cual lo hacía `loadStatusTotals('active')`:

```bash
echo "await (async () => { const db = (await import('@adonisjs/lucid/services/db')).default; const rows = await db.rawQuery(\"SELECT COALESCE(SUM(CAST(ROUND(bs.billing_subscription_contracted_subtotal * 100) AS SIGNED)), 0) AS netoCents, COUNT(*) AS suscripciones FROM billing_subscriptions bs INNER JOIN business_units bu ON bu.business_unit_id = bs.business_unit_id WHERE bs.billing_subscription_deleted_at IS NULL AND bu.business_unit_deleted_at IS NULL AND bs.billing_subscription_status = 'active'\"); console.log(JSON.stringify(rows[0])); })()" | node ace repl 2>&1 | grep -v "Deprecation\|trace-deprecation\|TensorFlow\|tfjs\|====\|👋\|Type \".ls\""
```

Expected: los dos números iguales, al centavo. Si difieren, **parar**: el `GROUP BY` está perdiendo o duplicando filas y nada más de esta HU importa hasta resolverlo.

- [ ] **Step 3: El invariante del cuadre (CA-3)**

```bash
curl -s "$BASE/api/platform/metrics/mrr" -H "Authorization: Bearer $TOKEN" \
  | jq '{total: .data.mrrActualNetoCents, suma: ([.data.concentracion.unidades[].mrrNetoCents] | add // 0), cuadra: (.data.mrrActualNetoCents == ([.data.concentracion.unidades[].mrrNetoCents] | add // 0))}'
```

Expected: `cuadra: true`.

- [ ] **Step 4: La bolsa única y la ausencia de identidad (CA-2)**

```bash
curl -s "$BASE/api/platform/metrics/mrr" -H "Authorization: Bearer $TOKEN" \
  | jq '[.data.concentracion.unidades[] | select(.tipo == "sin-grupo")] | length'
```

Expected: `1` (o `0` si todos los clientes activos están agrupados). Nunca más de uno.

```bash
curl -s "$BASE/api/platform/metrics/mrr" -H "Authorization: Bearer $TOKEN" \
  | jq '.data.concentracion' | grep -ci "businessUnit\|business_unit\|publicId"
```

Expected: `0`.

- [ ] **Step 5: El grupo apagado sigue concentrando (regla 4 del contrato)**

`QA-DBG-Apagado` tiene `platform_tenant_group_active = 0` y una cuenta con suscripción activa.

```bash
curl -s "$BASE/api/platform/metrics/mrr" -H "Authorization: Bearer $TOKEN" \
  | jq '.data.concentracion.unidades[] | select(.nombre == "QA-DBG-Apagado")'
```

Expected: aparece, con su importe y su participación.

- [ ] **Step 6: Baja lógica de un grupo con miembros activos (CA-4) — prueba manual obligatoria**

Anotar el id y el importe de `QA-DBG-Manny` antes de tocar nada. Darlo de baja por el endpoint de grupos (o, si no está a mano, con un `UPDATE` puntual sobre `platform_tenant_group_deleted_at`) y volver a consultar:

```bash
curl -s "$BASE/api/platform/metrics/mrr" -H "Authorization: Bearer $TOKEN" \
  | jq '{unidades: [.data.concentracion.unidades[] | {nombre, mrrNetoCents}], total: .data.mrrActualNetoCents, cuadra: (.data.mrrActualNetoCents == ([.data.concentracion.unidades[].mrrNetoCents] | add // 0))}'
```

Expected, las cuatro cosas a la vez:
- [ ] `QA-DBG-Manny` **no** aparece en `unidades`.
- [ ] El importe que tenía ahora está sumado dentro de `Sin grupo`.
- [ ] `cuadra: true` — el total no se movió.
- [ ] La respuesta es `200`: un vínculo huérfano **nunca** produce un 500.

Restaurar el grupo (poner `platform_tenant_group_deleted_at` en `NULL`) y confirmar que vuelve a aparecer con su importe.

- [ ] **Step 7: El proyectado de pruebas no entra al reparto (CA-6)**

```bash
curl -s "$BASE/api/platform/metrics/mrr" -H "Authorization: Bearer $TOKEN" \
  | jq '{proyectado: .data.mrrProyectadoTrialCents, enPrueba: .data.suscripcionesEnPrueba, sumaReparto: ([.data.concentracion.unidades[].mrrNetoCents] | add // 0), total: .data.mrrActualNetoCents}'
```

Expected: con `proyectado` mayor que cero, `sumaReparto` sigue siendo igual a `total` y **no** incluye ese importe.

- [ ] **Step 8: Grupos sin ingreso activo, informados (CA-10)**

```bash
curl -s "$BASE/api/platform/metrics/mrr" -H "Authorization: Bearer $TOKEN" \
  | jq '{omitidos: .data.concentracion.gruposOmitidosSinMrr, listados: [.data.concentracion.unidades[] | select(.tipo=="grupo").nombre]}'
```

Expected: `QA-CON-Sin Clientes` **no** está en `listados`, y `omitidos` es al menos `1`.

- [ ] **Step 9: Un tenant con dos suscripciones activas en el mismo grupo (prueba manual obligatoria)**

Agregar una segunda suscripción `active` a una cuenta de `QA-DBG-Manny` (misma regla heredada de la orden 8: no se colapsa por tenant) y reconsultar.

Expected: el `mrrNetoCents` del grupo **sube** por las dos suscripciones, `tenants` **no** cambia (sigue contando clientes distintos), el total sube lo mismo y `cuadra` sigue en `true`.

- [ ] **Step 10: El guard sigue en su lugar**

```bash
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/api/platform/metrics/mrr"
curl -s "$BASE/api/platform/metrics/mrr" -H "Authorization: Bearer $TOKEN_NO_ADMIN" | jq '.key'
```

Expected: `401` sin token; `"AUTH.PLATFORM.FORBIDDEN"` con un token sin `is_platform_admin` (sin campo `code`: inconsistencia heredada del área, **no se corrige aquí**).

- [ ] **Step 11: Commit (solo si el seeder o algún ajuste cambió código versionado)**

El seeder **no se commitea**: `_tmp_do_not_commit_qa_seeder.ts` está fuera del control de versiones a propósito. Si la verificación obligó a corregir el servicio:

```bash
git add app/services/platform_mrr_service.ts
git commit -m "fix: Corregir el reparto de MRR por grupo segun la verificacion"
```

---

### Task 5: Pre-review y PR

**Files:** ninguno nuevo.

**Interfaces:** ninguna.

- [ ] **Step 1: Validación completa**

```bash
npx tsc --noEmit && pnpm lint && node ace test unit --files=platform_mrr
```

Expected: PASS en los tres.

- [ ] **Step 2: Repasar el diff contra las reglas del repo**

```bash
git diff feature/USRH1788052455658-tenants-agrupados-sueltos...HEAD --stat
```

- [ ] Solo tres archivos versionados en el diff: el servicio, el controlador y la unitaria nueva.
- [ ] `start/routes.ts` y `start/routes/platform_mrr_routes.ts` **no aparecen**.
- [ ] Ninguna migración, ningún modelo, `app/models/business_unit.ts` intacto.
- [ ] Cero códigos nuevos en `app/constants/platform_metric_error_codes.ts`.
- [ ] Cero `any`; cero `.serialize()`, `.toJSON()` y `{ ...modelo }`.
- [ ] `billing_subscription_discount_percent` **no** aparece en el diff.
- [ ] El `LEFT JOIN` de grupos lleva `andOnNull` en el `ON`; no hay `whereNull('g.platform_tenant_group_deleted_at')`.
- [ ] `platform_tenant_group_active` no aparece en ningún `where`.
- [ ] Todo campo de dinero nuevo termina en `Cents`.
- [ ] JSDoc en español en todo lo exportado, sin `@example`, sin emojis.

- [ ] **Step 3: Cada regla de negocio contra su sostén**

| Regla | Dónde se sostiene |
|---|---|
| 1. Se reparte el actual neto canónico | `loadConcentrationRows` usa `mrrBaseQuery` + `CONTRACTED_SUBTOTAL_CENTS_SQL` sin tocarlos; Task 4, paso 2 |
| 2. Cada grupo es una unidad y suma a sus clientes | `GROUP BY g.platform_tenant_group_id`; Task 4, paso 9 |
| 3. Una sola bolsa "Sin grupo", sin identidad de clientes | unitaria "CA-2 — los clientes sin grupo son una sola unidad…"; Task 4, paso 4 |
| 4. Grupo dado de baja ⇒ sus clientes a "Sin grupo", nunca error | el filtro en el `ON`; Task 4, paso 6 |
| 5. La participación se deriva del importe, a un decimal | unitaria "CA-5 — la participación se deriva del importe…" |
| 6. La suma del reparto = el total | unitaria "CA-3 — la suma de las unidades es exactamente el total…"; Task 4, paso 3 |
| 7. Los porcentajes pueden no dar 100.0 | misma unitaria de CA-5 (`assert.notEqual(..., 100)`) |
| 8. El proyectado de pruebas fuera del reparto | `loadStatusTotals('trialing')` aparte; Task 4, paso 7 |
| 9. Unidades sin ingreso omitidas, con conteo | unitarias "CA-10 —…" y "regla 7 del contrato —…"; Task 4, paso 8 |
| 10. Un grupo al 100% es válido, sin umbrales | unitaria "CA-7 — un solo grupo con todo el ingreso…"; cero código de umbrales en el diff |

- [ ] **Step 4: Abrir el PR**

Target: `feature/USRH1788052455658-tenants-agrupados-sueltos`.

En la descripción, dejar constancia de las dos cosas que el plan decidió y el spec dejó abiertas:

> **Una sola consulta, no dos.** El spec pedía a la vez una "consulta auxiliar" para el desglose y que el total y el reparto salieran "de la misma consulta y del mismo corte". Se implementó lo segundo: la consulta del universo `active` se agrupa por grupo económico y de esas mismas filas se pliegan `mrrActualNetoCents`, `suscripcionesActivas` y el desglose. Con dos consultas, una suscripción activada entre ambas rompería el cuadre — el peor defecto de esta lectura. El universo, el filtro de estado y la expresión del neto de la orden 8 quedaron intactos; se verificó contra la consulta anterior que el total no se movió al centavo.
>
> **Textos del 500.** El spec citaba `title: 'No fue posible obtener el MRR'` / `key: 'no-fue-posible-obtener-el-mrr'`. El catálogo vigente emite `'Error inesperado al obtener el ingreso mensual recurrente'` con su `key` kebab y `code: PLT.MET.SYS_UNHANDLED`. Se conservó el catálogo vigente: esta rebanada no agrega ni renombra códigos de error.

Y repetir la deuda heredada: **no hay bitácora de grupos**, así que la concentración histórica no es reconstruible; el endpoint publica siempre el reparto de hoy con los grupos de hoy.

---

## Self-Review

**Cobertura del spec.** Los diez criterios de aceptación del spec que tocan al API tienen sostén: CA-1 (Task 2 + Task 4 paso 1), CA-2, CA-3, CA-5, CA-6, CA-7, CA-9 y CA-10 en unitarias de la Task 1 y verificación de la Task 4; CA-4 en el gotcha del `ON` más la prueba manual obligatoria de la Task 4 paso 6; CA-11 sin trabajo nuevo (la superficie de errores de la orden 5 ya envuelve `index` y no se agrega ningún código). CA-8 y CA-12 son de UI y viven en el plan del landlord. Las diez reglas de negocio tienen fila en la tabla de la Task 5. Las cinco reglas de seguridad aplicables quedan cubiertas: ruta ya protegida (no se crean rutas), nombre de grupo solo dentro de `/api/platform`, respuesta agregada sin identidad de tenants (verificado con `grep` en la Task 4), cero serialización de modelos Lucid y `deleted_at IS NULL` explícito en las tres tablas.

**Lo que este plan NO hace, y es deliberado.** No crea endpoint, ruta, migración, modelo ni código de error. No cachea ni materializa. No agrega umbrales, semáforos ni alertas. No publica series históricas de concentración. No toca la administración de grupos ni la asignación de tenants.

**Un hueco que hay que mirar a los ojos.** `gruposOmitidosSinMrr` sale de una segunda consulta (el conteo de grupos vivos) y, a diferencia del dinero, no está protegido por el invariante: si alguien crea un grupo entre las dos lecturas, el conteo de omitidos puede quedar corto por uno. Es un conteo informativo de catálogo, no dinero, y por eso se aceptó; si algún día importa al centavo, se resuelve con un `LEFT JOIN` desde `platform_tenant_groups` en lugar de un conteo aparte, a costa de listar también los grupos en cero.

**Dependencia de rama, no solo de producto.** El servicio referencia `platform_tenant_group_members` y `platform_tenant_groups`: sin la orden 12 integrada, la consulta no encuentra las tablas y la Task 4 falla en el primer `curl`. Están presentes en la rama de trabajo (verificado en las migraciones), así que el plan arranca directo.
