# Marcar la categoría de teletrabajo en los tipos de activo (VLRH-H1791306074983) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada tipo de activo de la empresa lleve a lo más una categoría de teletrabajo (`ergonomic_chair`, `computing_equipment`, `accessory`) o ninguna, fijable en el alta (`POST /api/supply-types`) y cambiable o quitables en un tipo existente (`PUT /api/supply-types/:id`) sin renombrarlo, legible en `GET /api/asset-types` como `teleworkCategory`, y expuesta en el drawer *Tipos y características* del BO (selector por tipo con permiso de edición, etiqueta de solo lectura sin él, y selector en el alta).

**Architecture:** API (`gsti-rh-api`, Adonis 6): columna `enum` nullable en `supply_types`, una constante cerrada al estilo de `EMPLOYEE_WORK_SCHEDULE`, campo opcional y nullable en los validadores y el servicio existentes, y el `catch` del controller legacy deja de devolver 400 para los dos casos nuevos usando las factorías de `AssetError`. No hay ruta nueva: el `PUT` legacy ya acepta escritura parcial y su validador tiene todos los campos opcionales. BO (`gsti-rh-bo`, Nuxt SPA): el drawer no editaba tipos y el `asset-types.repository.ts` no tenía `PUT`; se agrega el selector controlado por `:model-value` (sin estado local) y una función de repositorio que manda **solo** la categoría.

**Tech Stack:** Adonis 6 + VineJS + Lucid (MySQL) + japa (API, BD de pruebas `sae_pruebas`); Nuxt 4 SPA + Vue 3 + PrimeVue + Vitest (BO).

**Spec:** `/Users/noeabelvargaslopez/Downloads/spec-VLRH-H1791306074983.md` — el plan argumenta desde él; el ejecutor lee **ambos**. Los literales de las tres categorías, los `key` de error, los textos i18n y el contrato §11 se copian **verbatim** del spec, no se improvisan.

**Ramas:** `feature/VLRH-H1791306074983-marcar-la-categoria-de-teletrabajo-en-los-tipos-de` ya existe y está cargada en **ambos** repos (target `multitenant`). Depende de `VLRH-H1782788926678` (cerrada, integrada en `multitenant`), que solo se espeja como patrón.

**Validación de anclas (2026-10-08):** hecha contra `gsti-rh-api` @ `eb12b271` y `gsti-rh-bo` @ `af356a82`, cada uno en su rama de la HU. Coincide todo lo citado por el spec: rutas legacy con `permissionGate` + `businessScope` en `start/routes/supply_type.ts:5-30`; `SupplyTypeService.create/update` con `merge(data)` en `app/services/supply_type_service.ts:46-116`; `SupplyType.findOrFail` con el mixin `withBusinessUnitScope` (`app/models/supply_type.ts:59`); factorías y `respondAssetError` en `app/modules/assets/assets.error.ts:16-161` (ya usado por `destroy` de este mismo controller, `app/controllers/supply_types_controller.ts:248-256`); `ASSET_ERROR_KEYS` y `AssetErrorKey` en `app/modules/assets/assets.constants.ts:60-74`; `AssetTypeDto` ya expone `slug` y `description` (`app/modules/assets/dto/assets.dto.ts:132-140`); `findTypes` en `app/modules/assets/assets.repository.mysql.ts:558-620` con el filtro `whereIn('st.business_unit_id', scope)`; bloque i18n `asset_type_*`/`asset_file_not_found_detail` en `resources/langs/es.json:3382` y `en.json:3379`; en BO, el drawer sin edición de tipos (`components/assetTypesDrawer/index.vue`, `script.ts`) y el repositorio sin `PUT` (`pages/supplies/infrastructure/asset-types.repository.ts:66-121`). **Un drift trivial, resuelto aquí** (no cambia alcance, contrato §11 ni reglas §4; nada que escalar a Wilvardo):

1. **Prefijo y nombre de la migración.** El censo reserva `1791306074983_add_telework_category_to_supply_types_table.ts`, pero §10 manda generarla con `node ace make:migration` y verificar que el prefijo siga siendo el último. El último vigente hoy es `1791448005837_create_traumatic_event_report_notification_logs_table.ts` (más `create_passkey_credentials_table.ts`, sin prefijo), **posterior** al timestamp reservado. Se genera con `make:migration`; el prefijo de 13 dígitos que salga (posterior a `1791448005837`) cumple el orden de §10. El nombre real se anota en el commit.

**Dónde va la documentación:** este plan y el manual de QA en `gsti-rh-api/docs/superpowers/plans/` (ese directorio **sí** se versiona). El BO no lleva documentos.

## Global Constraints

- **Rama y commits:** Conventional Commits, descripción en español, footer `Refs: VLRH-H1791306074983`. El plan termina en la verificación automatizada y en la **entrega** del manual de QA, que recorre una persona.
- **Reglas exactas (§4):** categoría opcional (`null` = sin categoría, no es insumo y funciona como siempre); un tipo tiene **a lo más** una categoría; poner/cambiar/quitar exige los permisos que ya gobiernan los tipos (`supplies:create` en el alta, `supplies:update` en el PUT). La empresa no crea, renombra ni borra categorías.
- **Ausente ≠ `null`:** ausente (`undefined`) no cambia el valor; `null` lo limpia. Nunca `?? null` ni `|| undefined` que convierta `null` en ausente.
- **Contrato del POST/PUT:** `supplyTypeTeleworkCategory?: 'ergonomic_chair' | 'computing_equipment' | 'accessory' | null`. El PUT sigue aceptando **solo** la categoría (`{ "supplyTypeTeleworkCategory": "accessory" }` es un cuerpo válido) y no exige `supplyTypeName`.
- **Lectura:** `GET /api/asset-types` agrega `teleworkCategory` a cada elemento; `GET /api/supply-types` y `GET /api/supply-types/:id` serializan `supplyTypeTeleworkCategory` sin código nuevo.
- **Errores nuevos (solo estos dos; el resto conserva el 400 legacy):** cuerpo `{ type, title, message, detail, key, data }`, `message = detail`, **sin** `code` ni prefijo `TW*`.

  | HTTP | `key` | `title` (es) | `detail` (es) | Prefijo i18n |
  |---|---|---|---|---|
  | 422 | `categoria-de-insumo-invalida` | Categoría de insumo inválida | La categoría debe ser Silla ergonómica, Equipo de cómputo o impresión o Aditamento. | `asset_type_telework_category_invalid` |
  | 404 | `tipo-de-activo-no-encontrado` | Tipo de activo no encontrado | El tipo de activo no existe o no pertenece a la empresa. | `asset_type_not_found` |

  En inglés: "Invalid supply category" / "The category must be Ergonomic chair, Computer or printing equipment or Accessory." y "Asset type not found" / "The asset type does not exist or does not belong to the company."
- **Rótulos sin numeral (CA-11):** los rótulos son "Silla ergonómica", "Equipo de cómputo o impresión", "Aditamento" y "Sin categoría". Ningún rótulo lleva numeral de la norma.
- **No tocar (censo del spec; nada puede aparecer en `git diff --name-only`):** API `start/routes/supply_type.ts`, `app/modules/assets/assets.routes.ts`, `app/modules/assets/assets.controller.ts`, `app/modules/assets/assets.service.ts`, `app/modules/assets/assets.repository.ts`, `app/services/telework_worker_service.ts`, `tests/functional/supplies_permission_gate.spec.ts`; BO `pages/telework-workers/**`, `components/teleworkWorkerDrawer/**`, `components/teleworkWorkerSuppliesSection/**`. El aislamiento por empresa lo hace el mixin con `businessScope`: no se duplica el gate ni se filtra `business_unit_id` a mano, y no se crea endpoint nuevo en `app/modules/assets` para escribir la categoría.
- **Sin:** tabla sembrada de categorías, seeder de categorías, `system_modules.constant.ts` (el módulo `supplies` ya declara read/create/update/delete con exigencia activa), backfill (los tipos existentes quedan `NULL`), índice nuevo, migración que importe la constante (los literales van en la migración).
- **Idioma y tipos:** TS estricto, cero `any`; comentarios y JSDoc en español; identificadores en inglés. Los literales de categoría viven **solo** en `app/constants/supply_type_telework_category.ts` (API), el enum del BO y la migración.
- **i18n API:** las cuatro claves nuevas van tras `asset_file_not_found_detail` (`resources/langs/es.json:3382` / `en.json:3379`), **nunca al final del archivo**.
- **BD de pruebas:** antes de cada tanda funcional, `NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed` (el spec del módulo `supplies` y sus permisos dependen de la siembra). Nunca contra la BD de desarrollo.
- **Líneas base medidas el 2026-10-08** (con `sae_pruebas` recién sembrada):
  - API: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace test functional --files="tests/functional/assets_module.spec.ts"` → **17 passed**; `./node_modules/.bin/tsc --noEmit` → **exit 0**; `./node_modules/.bin/eslint app/validators/supply_type.ts app/services/supply_type_service.ts app/modules/assets/assets.error.ts app/modules/assets/assets.constants.ts app/modules/assets/dto/assets.dto.ts app/modules/assets/assets.repository.mysql.ts app/controllers/supply_types_controller.ts app/models/supply_type.ts` → **exit 0**.
  - BO: `./node_modules/.bin/vitest run tests/supplies/supplies-permission-bindings.spec.ts` → **11 passed**; `./node_modules/.bin/eslint pages/supplies components/assetTypesDrawer` → **exit 0**.
  - En el BO, `pnpm test` puede morir en el chequeo de dependencias de pnpm: se corre `./node_modules/.bin/vitest run …` directo, como se midió.
- **Migración:** aditiva, nullable y reversible; no siembra nada.

## Review Focus

Las cinco clases de entrada o modos de fallo que el spec implica y ningún criterio de aceptación ejercita directamente. Cada línea tiene su prueba en la tarea que posee el código.

1. **POST con `null` explícito:** CA-2 solo prueba campo ausente o valor válido; `null` en el alta debe crear el tipo con `teleworkCategory: null` (no 422, la columna es nullable). → spec funcional, **Task 2**.
2. **PUT con cuerpo vacío `{}`** sobre un tipo con categoría: ningún campo cambia, responde 200 y la categoría queda intacta (el PUT legacy sigue aceptando escritura parcial total). → spec funcional, **Task 2**.
3. **`supplyTypeTeleworkCategory` con un valor no-string** (`5`, `true`) → 422 con la misma `key` (CA-6 solo cubre string fuera del catálogo y arreglo). → spec funcional, **Task 2**.
4. **Tipo global (`business_unit_id` NULL)** como objetivo del PUT → 404 `tipo-de-activo-no-encontrado` indistinguible (CA-7 cubre otra empresa e inexistente, no global; §10 lo declara aceptado). → spec funcional, **Task 2**.
5. **BO: `teleworkCategory` con un valor de tipo inesperado** (número u objeto) en la respuesta de `GET /api/asset-types` → `mapType` lo anula a `null` sin romper el listado (el spec solo describe el valor fuera del catálogo como string). → spec de repositorio, **Task 3**.

---

# Repo 1: `gsti-rh-api`

Rama de trabajo: `feature/VLRH-H1791306074983-marcar-la-categoria-de-teletrabajo-en-los-tipos-de` (ya cargada). Rutas relativas a `/Users/noeabelvargaslopez/Documents/projects/gsti-rh-api`.

### Task 1: Columna, constante y lectura de la categoría en el catálogo

**Files:**
- Create: `database/migrations/<prefijo de make:migration>_add_telework_category_to_supply_types_table.ts`
- Create: `app/constants/supply_type_telework_category.ts`
- Modify: `app/models/supply_type.ts` (columna y bloque swagger)
- Modify: `app/modules/assets/dto/assets.dto.ts` (`AssetTypeDto`, `:132-140`)
- Modify: `app/modules/assets/assets.repository.mysql.ts` (`findTypes`, `:558-620`)
- Test: `tests/functional/assets_module.spec.ts`

**Interfaces:**
- Produces (Tasks 2 y 4 lo consumen; y los consumidores de §9 `VLRH-H1791311162011`/`VLRH-H1791306075599`/`VLRH-H1791306076849`):
  - `SUPPLY_TYPE_TELEWORK_CATEGORY` = `{ ERGONOMIC_CHAIR: 'ergonomic_chair', COMPUTING_EQUIPMENT: 'computing_equipment', ACCESSORY: 'accessory' } as const`; `type SupplyTypeTeleworkCategory` (unión derivada); `SUPPLY_TYPE_TELEWORK_CATEGORIES: readonly SupplyTypeTeleworkCategory[]` en ese orden. Todos públicos en `app/constants/supply_type_telework_category.ts`. **Nombres contrato: no renombrar.**
  - Modelo `SupplyType.supplyTypeTeleworkCategory: SupplyTypeTeleworkCategory | null`.
  - `AssetTypeDto.teleworkCategory: SupplyTypeTeleworkCategory | null`.
  - Columna `supply_types.supply_type_telework_category` (`enum('ergonomic_chair','computing_equipment','accessory')`, nullable, tras `supply_type_slug`).

- [ ] **Step 1: Escribir la prueba que falla — el catálogo expone `teleworkCategory`**

En `tests/functional/assets_module.spec.ts`, dentro del grupo `Activos — módulo de lectura y reglas de servidor`, **después** del test `asset-types: conteo de activos y características` (hoy termina en `:578`; ahí `laptopTypeId` y `assignedEmployeeSupplyId` ya están creados):

```ts
test('asset-types: expone teleworkCategory nula en un tipo sin categoría (CA-5)', async ({
  client,
  assert,
}) => {
  const actor = required(owner, 'owner')
  const response = await call(client, actor, 'get', '/api/asset-types')
  response.assertStatus(200)
  const laptop = (response.body().data as AssetTypeDto[]).find(
    (type) => type.supplyTypeId === laptopTypeId
  )
  assert.property(laptop, 'teleworkCategory')
  assert.isNull(laptop?.teleworkCategory)
})
```

- [ ] **Step 2: Correr la prueba para verla fallar**

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace test functional --files="tests/functional/assets_module.spec.ts"`
Expected: FAIL — la propiedad `teleworkCategory` no existe en el elemento del catálogo.

- [ ] **Step 3: Crear la constante de categorías**

`app/constants/supply_type_telework_category.ts`:

```ts
/**
 * Categorías de insumo de teletrabajo (NOM-037-STPS-2023). Atributo cerrado
 * fijado por la norma, no entidad referenciada: por eso constante + enum de
 * columna y no tabla sembrada. Única fuente de verdad de los literales que
 * persisten en `supply_types.supply_type_telework_category`.
 */
export const SUPPLY_TYPE_TELEWORK_CATEGORY = {
  ERGONOMIC_CHAIR: 'ergonomic_chair',
  COMPUTING_EQUIPMENT: 'computing_equipment',
  ACCESSORY: 'accessory',
} as const

export type SupplyTypeTeleworkCategory =
  (typeof SUPPLY_TYPE_TELEWORK_CATEGORY)[keyof typeof SUPPLY_TYPE_TELEWORK_CATEGORY]

export const SUPPLY_TYPE_TELEWORK_CATEGORIES: readonly SupplyTypeTeleworkCategory[] = [
  SUPPLY_TYPE_TELEWORK_CATEGORY.ERGONOMIC_CHAIR,
  SUPPLY_TYPE_TELEWORK_CATEGORY.COMPUTING_EQUIPMENT,
  SUPPLY_TYPE_TELEWORK_CATEGORY.ACCESSORY,
]
```

- [ ] **Step 4: Generar y escribir la migración**

Run: `node ace make:migration add_telework_category_to_supply_types_table`
Luego verificar que el archivo quedó **el último**: `ls database/migrations | tail -3` (debe listar el nuevo `<prefijo>_add_telework_category_to_supply_types_table.ts` después de `1791448005837_...`). Cuerpo (literales en la migración, **sin** importar la constante):

```ts
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'supply_types'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .enum('supply_type_telework_category', [
          'ergonomic_chair',
          'computing_equipment',
          'accessory',
        ])
        .nullable()
        .after('supply_type_slug')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('supply_type_telework_category')
    })
  }
}
```

- [ ] **Step 5: Modelo, DTO y repositorio**

En `app/models/supply_type.ts`, tras `supplyTypeIdentifier` (`:96`), agregar la columna y una propiedad en el bloque `@swagger` (`:26-36`):

```ts
@column()
declare supplyTypeTeleworkCategory: SupplyTypeTeleworkCategory | null
```

Importar `import type { SupplyTypeTeleworkCategory } from '#constants/supply_type_telework_category'`. En el swagger, `supplyTypeTeleworkCategory: { type: string, nullable: true, enum: [ergonomic_chair, computing_equipment, accessory] }`.

En `app/modules/assets/dto/assets.dto.ts`, en `AssetTypeDto` (`:140`), agregar `teleworkCategory: SupplyTypeTeleworkCategory | null` e importar el tipo desde `#constants/supply_type_telework_category`.

En `app/modules/assets/assets.repository.mysql.ts` `findTypes` (`:558-620`): añadir `'st.supply_type_telework_category'` al `.select(...)`; en el tipo de fila local (`types: Array<{...}>`) añadir `supply_type_telework_category: SupplyTypeTeleworkCategory | null`; y en el `.map` de retorno agregar `teleworkCategory: type.supply_type_telework_category ?? null`. Importar `type SupplyTypeTeleworkCategory`.

- [ ] **Step 6: Correr la prueba para verla pasar, y la suite del módulo**

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace test functional --files="tests/functional/assets_module.spec.ts"`
Expected: PASS — 18 passed (17 base + CA-5).

- [ ] **Step 7: Verificar migración reversible y typecheck**

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:rollback && NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:run`
Expected: rollback 1 batch y run sin error (la columna se crea y se borra).
Run: `./node_modules/.bin/tsc --noEmit`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add database/migrations app/constants/supply_type_telework_category.ts app/models/supply_type.ts app/modules/assets/dto/assets.dto.ts app/modules/assets/assets.repository.mysql.ts tests/functional/assets_module.spec.ts
git commit -m "feat(activos): agrega la categoría de teletrabajo al tipo de activo y al catálogo

Refs: VLRH-H1791306074983"
```

### Task 2: Escritura de la categoría y sus errores (422 y 404)

**Files:**
- Modify: `app/validators/supply_type.ts` (create y update)
- Modify: `app/services/supply_type_service.ts` (`create` `:46-69`, `update` `:92-116`)
- Modify: `app/modules/assets/assets.constants.ts` (`ASSET_ERROR_KEYS`, `:60-72`)
- Modify: `app/modules/assets/assets.error.ts` (factorías)
- Modify: `app/controllers/supply_types_controller.ts` (`store` `:158-167`, `update` `:216-225`)
- Modify: `resources/langs/es.json` (tras `:3382`)
- Modify: `resources/langs/en.json` (tras `:3379`)
- Test: `tests/functional/assets_module.spec.ts`

**Interfaces:**
- Consumes: de Task 1 — `SUPPLY_TYPE_TELEWORK_CATEGORIES`, `SupplyTypeTeleworkCategory`.
- Produces: `ASSET_ERROR_KEYS.TELEWORK_CATEGORY_INVALID = 'categoria-de-insumo-invalida'` y `ASSET_ERROR_KEYS.TYPE_NOT_FOUND = 'tipo-de-activo-no-encontrado'`; `AssetError.teleworkCategoryInvalid(): AssetError` (422, prefijo `asset_type_telework_category_invalid`) y `AssetError.assetTypeNotFound(): AssetError` (404, prefijo `asset_type_not_found`).

- [ ] **Step 1: Escribir las pruebas que fallan (CA-1 a CA-7 + Review Focus 1-4)**

Añadir al grupo, tras el test de CA-5:

```ts
test('categoría de teletrabajo: PUT solo la categoría no renombra ni toca resguardos (CA-1)', async ({
  client,
  assert,
}) => {
  const actor = required(owner, 'owner')
  const before = (await call(client, actor, 'get', '/api/asset-types')).body()
    .data as AssetTypeDto[]
  const laptopBefore = before.find((type) => type.supplyTypeId === laptopTypeId)
  const resguardosBefore = await db
    .from('employee_supplies')
    .where('supply_id', assignedAssetId)
    .count('* as total')

  const put = await call(client, actor, 'put', `/api/supply-types/${laptopTypeId}`, {
    supplyTypeTeleworkCategory: 'computing_equipment',
  })
  put.assertStatus(200)

  const after = (await call(client, actor, 'get', '/api/asset-types')).body().data as AssetTypeDto[]
  const laptopAfter = after.find((type) => type.supplyTypeId === laptopTypeId)
  assert.equal(laptopAfter?.teleworkCategory, 'computing_equipment')
  assert.equal(laptopAfter?.name, laptopBefore?.name)
  assert.equal(laptopAfter?.slug, laptopBefore?.slug)
  assert.equal(laptopAfter?.suppliesCount, laptopBefore?.suppliesCount)
  const resguardosAfter = await db
    .from('employee_supplies')
    .where('supply_id', assignedAssetId)
    .count('* as total')
  assert.deepEqual(resguardosAfter, resguardosBefore)

  const clean = await call(client, actor, 'put', `/api/supply-types/${laptopTypeId}`, {
    supplyTypeTeleworkCategory: null,
  })
  clean.assertStatus(200)
})

test('categoría desde el alta, sin el campo y con null (CA-2, Review Focus 1)', async ({
  client,
  assert,
}) => {
  const actor = required(owner, 'owner')
  const withCategory = await call(client, actor, 'post', '/api/supply-types', {
    supplyTypeName: uniqueTestName('Silla Ergo'),
    supplyTypeTeleworkCategory: 'ergonomic_chair',
  })
  withCategory.assertStatus(201)
  const withNull = await call(client, actor, 'post', '/api/supply-types', {
    supplyTypeName: uniqueTestName('Sin categoría'),
    supplyTypeTeleworkCategory: null,
  })
  withNull.assertStatus(201)
  const withoutField = await call(client, actor, 'post', '/api/supply-types', {
    supplyTypeName: uniqueTestName('Sin campo'),
  })
  withoutField.assertStatus(201)

  const rows = (await call(client, actor, 'get', '/api/asset-types')).body().data as AssetTypeDto[]
  const categoryOf = (id: number) => rows.find((type) => type.supplyTypeId === id)?.teleworkCategory
  assert.equal(categoryOf(withCategory.body().data.supplyType.supplyTypeId), 'ergonomic_chair')
  assert.isNull(categoryOf(withNull.body().data.supplyType.supplyTypeId))
  assert.isNull(categoryOf(withoutField.body().data.supplyType.supplyTypeId))
})

test('quitar la categoría deja resguardos, contratos y activos intactos (CA-3)', async ({
  client,
  assert,
}) => {
  const actor = required(owner, 'owner')
  await call(client, actor, 'put', `/api/supply-types/${laptopTypeId}`, {
    supplyTypeTeleworkCategory: 'computing_equipment',
  })
  const contractsBefore = await db
    .from('employee_supplies_response_contracts')
    .where('employee_supply_id', assignedEmployeeSupplyId)
    .count('* as total')

  const put = await call(client, actor, 'put', `/api/supply-types/${laptopTypeId}`, {
    supplyTypeTeleworkCategory: null,
  })
  put.assertStatus(200)

  const laptop = ((await call(client, actor, 'get', '/api/asset-types')).body()
    .data as AssetTypeDto[]).find((type) => type.supplyTypeId === laptopTypeId)
  assert.isNull(laptop?.teleworkCategory)
  assert.equal(laptop?.suppliesCount, 4)
  const contractsAfter = await db
    .from('employee_supplies_response_contracts')
    .where('employee_supply_id', assignedEmployeeSupplyId)
    .count('* as total')
  assert.deepEqual(contractsAfter, contractsBefore)
})

test('categoría ausente no cambia y cuerpo vacío no altera nada (CA-4, Review Focus 2)', async ({
  client,
  assert,
}) => {
  const actor = required(owner, 'owner')
  await call(client, actor, 'put', `/api/supply-types/${laptopTypeId}`, {
    supplyTypeTeleworkCategory: 'computing_equipment',
  })

  const other = await call(client, actor, 'put', `/api/supply-types/${laptopTypeId}`, {
    supplyTypeDescription: 'Equipo portátil',
  })
  other.assertStatus(200)

  const empty = await call(client, actor, 'put', `/api/supply-types/${laptopTypeId}`, {})
  empty.assertStatus(200)

  const laptop = ((await call(client, actor, 'get', '/api/asset-types')).body()
    .data as AssetTypeDto[]).find((type) => type.supplyTypeId === laptopTypeId)
  assert.equal(laptop?.teleworkCategory, 'computing_equipment')
})

test('categoría fuera del catálogo responde 422 y no cambia nada (CA-6, Review Focus 3)', async ({
  client,
  assert,
}) => {
  const actor = required(owner, 'owner')
  const nameBefore = (
    await db.from('supply_types').where('supply_type_id', laptopTypeId).first()
  ).supply_type_name

  const invalid = await call(client, actor, 'put', `/api/supply-types/${laptopTypeId}`, {
    supplyTypeName: uniqueTestName('Portátil'),
    supplyTypeTeleworkCategory: 'monitor',
  })
  invalid.assertStatus(422)
  assert.equal(invalid.body().key, ASSET_ERROR_KEYS.TELEWORK_CATEGORY_INVALID)
  assert.isNull(invalid.body().data)

  for (const bad of [['ergonomic_chair', 'accessory'], 5, true]) {
    const response = await call(client, actor, 'put', `/api/supply-types/${laptopTypeId}`, {
      supplyTypeTeleworkCategory: bad,
    })
    response.assertStatus(422)
    assert.equal(response.body().key, ASSET_ERROR_KEYS.TELEWORK_CATEGORY_INVALID, JSON.stringify(bad))
  }

  const post = await call(client, actor, 'post', '/api/supply-types', {
    supplyTypeName: uniqueTestName('Aditamento'),
    supplyTypeTeleworkCategory: 'monitor',
  })
  post.assertStatus(422)
  assert.equal(post.body().key, ASSET_ERROR_KEYS.TELEWORK_CATEGORY_INVALID)

  const row = await db.from('supply_types').where('supply_type_id', laptopTypeId).first()
  assert.equal(row.supply_type_name, nameBefore)
})

test('tipo de otra empresa, inexistente o global responde 404 (CA-7, Review Focus 4)', async ({
  client,
  assert,
}) => {
  const actor = required(owner, 'owner')
  const other = required(otherOwner, 'otra empresa')
  const foreignTypeId = await createType(client, other, uniqueTestName('Silla'))

  for (const url of [
    `/api/supply-types/${foreignTypeId}`,
    '/api/supply-types/999999',
  ]) {
    const response = await call(client, actor, 'put', url, {
      supplyTypeTeleworkCategory: 'ergonomic_chair',
    })
    response.assertStatus(404)
    assert.equal(response.body().key, ASSET_ERROR_KEYS.TYPE_NOT_FOUND, url)
  }

  const [globalId] = await db.table('supply_types').insert({
    supply_type_name: uniqueTestName('Global'),
    supply_type_slug: unique('global'),
    business_unit_id: null,
    supply_type_created_at: new Date(),
    supply_type_updated_at: new Date(),
  })
  const global = await call(client, actor, 'put', `/api/supply-types/${globalId}`, {
    supplyTypeTeleworkCategory: 'ergonomic_chair',
  })
  global.assertStatus(404)
  assert.equal(global.body().key, ASSET_ERROR_KEYS.TYPE_NOT_FOUND)

  const foreignRow = await db.from('supply_types').where('supply_type_id', foreignTypeId).first()
  assert.isNull(foreignRow.supply_type_telework_category)
})
```

- [ ] **Step 2: Correr las pruebas para verlas fallar**

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace test functional --files="tests/functional/assets_module.spec.ts"`
Expected: FAIL — el PUT/POST acepta el campo pero no lo persiste ni devuelve la `key`; los 422/404 llegan como 200/400.

- [ ] **Step 3: Claves de error y factorías**

En `app/modules/assets/assets.constants.ts` (`ASSET_ERROR_KEYS`, `:60-72`) agregar, antes de `INVALID_INPUT`:

```ts
TELEWORK_CATEGORY_INVALID: 'categoria-de-insumo-invalida',
TYPE_NOT_FOUND: 'tipo-de-activo-no-encontrado',
```

(`AssetErrorKey` se deriva solo.) En `app/modules/assets/assets.error.ts` agregar dentro de la clase, antes de `fileNotFound` (`:119`):

```ts
/** La categoría no es una de las tres que fija la norma. */
static teleworkCategoryInvalid(): AssetError {
  return new AssetError(
    422,
    ASSET_ERROR_KEYS.TELEWORK_CATEGORY_INVALID,
    'asset_type_telework_category_invalid',
    'Categoría de insumo inválida',
    'La categoría debe ser Silla ergonómica, Equipo de cómputo o impresión o Aditamento.'
  )
}

/** El tipo no existe, es de otra empresa o es global. */
static assetTypeNotFound(): AssetError {
  return new AssetError(
    404,
    ASSET_ERROR_KEYS.TYPE_NOT_FOUND,
    'asset_type_not_found',
    'Tipo de activo no encontrado',
    'El tipo de activo no existe o no pertenece a la empresa.'
  )
}
```

- [ ] **Step 4: Validadores y servicio**

En `app/validators/supply_type.ts`, en `createSupplyTypeValidator` y `updateSupplyTypeValidator`, añadir el campo (mismo en ambos):

```ts
supplyTypeTeleworkCategory: vine.enum(SUPPLY_TYPE_TELEWORK_CATEGORIES).nullable().optional(),
```

Importar `SUPPLY_TYPE_TELEWORK_CATEGORIES` desde `#constants/supply_type_telework_category`.

En `app/services/supply_type_service.ts`, sumar `supplyTypeTeleworkCategory?: SupplyTypeTeleworkCategory | null` al tipo del parámetro `data` de `create` (`:46-51`) y de `update` (`:92-97`). `merge(data)` + `save()` ya resuelven ausente (`undefined` no cambia) y `null` (limpia). Sin otra lógica. Importar el tipo.

- [ ] **Step 5: Controller — 422 y 404 con `key`**

En `app/controllers/supply_types_controller.ts`, cambiar la firma de `store` a `async store(ctx: HttpContext)` y la de `update` a `async update(ctx: HttpContext)`, tomando `const { params, request, response } = ctx` en cada una (hoy reciben `{ request, response }` y `{ params, request, response }`). El `catch` es **distinto** en cada método — el 404 solo aplica a `update` (el alta crea el tipo, no puede no encontrarlo):

`store`:

```ts
} catch (error) {
  if (error instanceof vineErrors.E_VALIDATION_ERROR) {
    const messages = error.messages as Array<{ field?: string }>
    if (messages.some((message) => message.field === 'supplyTypeTeleworkCategory')) {
      return respondAssetError(ctx, AssetError.teleworkCategoryInvalid())
    }
  }
  return StandardResponseFormatter.error(response, error.message, 400)
}
```

`update`:

```ts
} catch (error) {
  if (error instanceof vineErrors.E_VALIDATION_ERROR) {
    const messages = error.messages as Array<{ field?: string }>
    if (messages.some((message) => message.field === 'supplyTypeTeleworkCategory')) {
      return respondAssetError(ctx, AssetError.teleworkCategoryInvalid())
    }
  }
  if ((error as { code?: string })?.code === 'E_ROW_NOT_FOUND') {
    return respondAssetError(ctx, AssetError.assetTypeNotFound())
  }
  return StandardResponseFormatter.error(response, error.message, 400)
}
```

`AssetError` y `respondAssetError` ya están importados (`:9`); agregar `import { errors as vineErrors } from '@vinejs/vine'`. En el swagger de `store` y `update`, agregar `supplyTypeTeleworkCategory` al `requestBody` y documentar `422: { description: "Categoría fuera del catálogo (`key: categoria-de-insumo-invalida`)" }` y, en `update`, `404: { description: "Tipo inexistente, de otra empresa o global (`key: tipo-de-activo-no-encontrado`)" }`.

- [ ] **Step 6: Claves i18n**

En `resources/langs/es.json`, tras `asset_file_not_found_detail` (`:3382`):

```json
"asset_type_telework_category_invalid_title": "Categoría de insumo inválida",
"asset_type_telework_category_invalid_detail": "La categoría debe ser Silla ergonómica, Equipo de cómputo o impresión o Aditamento.",
"asset_type_not_found_title": "Tipo de activo no encontrado",
"asset_type_not_found_detail": "El tipo de activo no existe o no pertenece a la empresa.",
```

En `resources/langs/en.json`, tras `asset_file_not_found_detail` (`:3379`):

```json
"asset_type_telework_category_invalid_title": "Invalid supply category",
"asset_type_telework_category_invalid_detail": "The category must be Ergonomic chair, Computer or printing equipment or Accessory.",
"asset_type_not_found_title": "Asset type not found",
"asset_type_not_found_detail": "The asset type does not exist or does not belong to the company.",
```

- [ ] **Step 7: Correr la suite del módulo y las líneas base**

Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace test functional --files="tests/functional/assets_module.spec.ts"`
Expected: PASS — 24 passed (17 base + CA-5 de la Task 1 + CA-1, CA-2, CA-3, CA-4, CA-6 y CA-7; los bordes de Review Focus van dentro de esos mismos tests: el `null` del POST en CA-2, el cuerpo vacío en CA-4, el valor no-string en CA-6 y el tipo global en CA-7).
Run: `NODE_ENV=test DB_DATABASE=sae_pruebas node ace test functional --files="tests/functional/supplies_permission_gate.spec.ts"`
Expected: PASS sin cambios (el 403 de CA-8 lo cubre ese spec; el gate no se toca).
Run: `./node_modules/.bin/tsc --noEmit` y `./node_modules/.bin/eslint app/validators/supply_type.ts app/services/supply_type_service.ts app/modules/assets/assets.error.ts app/modules/assets/assets.constants.ts app/modules/assets/dto/assets.dto.ts app/modules/assets/assets.repository.mysql.ts app/controllers/supply_types_controller.ts app/models/supply_type.ts`
Expected: exit 0 en ambos.

- [ ] **Step 8: Verificar CA-11 (rótulos sin numeral) y el aislamiento**

Run: `git diff multitenant...HEAD -- '*.json' | grep -E '^\+' | grep -nE '5\.[0-9]|numeral'`
Expected: salida vacía.

Run: `git diff --name-only multitenant...HEAD -- app/modules/assets/assets.routes.ts app/modules/assets/assets.controller.ts app/modules/assets/assets.service.ts app/modules/assets/assets.repository.ts app/services/telework_worker_service.ts start/routes/supply_type.ts`
Expected: salida vacía (CA-12, frontera con `VLRH-H1791311162011`).

- [ ] **Step 9: Commit**

```bash
git add app/validators/supply_type.ts app/services/supply_type_service.ts app/modules/assets/assets.constants.ts app/modules/assets/assets.error.ts app/controllers/supply_types_controller.ts resources/langs/es.json resources/langs/en.json tests/functional/assets_module.spec.ts
git commit -m "feat(activos): escribe la categoría de teletrabajo y responde 422/404 con key

Refs: VLRH-H1791306074983"
```

---

# Repo 2: `gsti-rh-bo`

Rama de trabajo: `feature/VLRH-H1791306074983-marcar-la-categoria-de-teletrabajo-en-los-tipos-de` (ya cargada). Rutas relativas a `/Users/noeabelvargaslopez/Documents/projects/gsti-rh-bo`.

### Task 3: Dominio, repositorio y caso de uso de la categoría

**Files:**
- Modify: `pages/supplies/domain/asset.enum.ts`
- Modify: `pages/supplies/domain/asset.interface.ts` (`AssetType`, `:80-85`)
- Modify: `pages/supplies/infrastructure/asset-types.repository.ts` (`mapType`, `createAssetType`, función nueva)
- Modify: `pages/supplies/application/use-asset-types.ts`
- Modify: `pages/supplies/script.ts` (deps de `useAssetTypes`, `:91-105`)
- Modify: `pages/supplies/domain/locales/supplies.es.json` y `supplies.en.json`
- Test: `tests/supplies/asset-types-category.spec.ts` (nuevo)

**Interfaces:**
- Produces (Task 4 lo consume):
  - `ASSET_TYPE_TELEWORK_CATEGORY` = `{ ERGONOMIC_CHAIR: 'ergonomic_chair', COMPUTING_EQUIPMENT: 'computing_equipment', ACCESSORY: 'accessory' } as const`; `type AssetTypeTeleworkCategory` en `pages/supplies/domain/asset.enum.ts`.
  - `AssetType.teleworkCategory: AssetTypeTeleworkCategory | null`.
  - `createAssetType(params: CreateAssetTypeParams)` con `CreateAssetTypeParams` = `AssetRequestParams & { name: string; teleworkCategory: AssetTypeTeleworkCategory | null }`.
  - `updateAssetTypeTeleworkCategory(params: AssetTypeIdParams & { teleworkCategory: AssetTypeTeleworkCategory | null }): Promise<void>` → `PUT /supply-types/:id` con body `{ supplyTypeTeleworkCategory }` y nada más.
  - `useAssetTypes(...).createType(name: string, teleworkCategory: AssetTypeTeleworkCategory | null)` y `.updateTeleworkCategory(supplyTypeId: number, teleworkCategory: AssetTypeTeleworkCategory | null)`; `UseAssetTypesDeps.messages` suma `categoryUpdated`.

- [ ] **Step 1: Escribir la prueba que falla**

`tests/supplies/asset-types-category.spec.ts` (modelo: `tests/attendanceAbsencesDrawer/absences.repository.spec.ts` para el stub de `$fetch`):

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAssetType,
  fetchAssetTypes,
  updateAssetTypeTeleworkCategory,
} from '~/pages/supplies/infrastructure/asset-types.repository'

const fetchMock = vi.fn()
const params = { apiBasePath: 'http://api.test', authToken: 'Bearer test-token', locale: 'es' }

describe('asset-types: categoría de teletrabajo (VLRH-H1791306074983)', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(undefined)
    vi.stubGlobal('window', {})
    vi.stubGlobal('$fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('mapea la categoría válida y anula lo desconocido (Review Focus 5)', async () => {
    fetchMock.mockResolvedValue({
      data: [
        { supplyTypeId: 4, name: 'Laptop', suppliesCount: 2, characteristics: [], teleworkCategory: 'computing_equipment' },
        { supplyTypeId: 5, name: 'Otro', suppliesCount: 0, characteristics: [], teleworkCategory: 'monitor' },
        { supplyTypeId: 6, name: 'Sin', suppliesCount: 0, characteristics: [], teleworkCategory: 5 },
        { supplyTypeId: 7, name: 'Ausente', suppliesCount: 0, characteristics: [] },
      ],
    })
    const types = await fetchAssetTypes(params)
    expect(types.map((type) => type.teleworkCategory)).toEqual([
      'computing_equipment',
      null,
      null,
      null,
    ])
  })

  it('el alta reenvía la categoría en el cuerpo (CA-10)', async () => {
    await createAssetType({ ...params, name: 'Silla Ergo', teleworkCategory: 'ergonomic_chair' })
    const [url, options] = fetchMock.mock.calls[0] as [string, { method: string; body: unknown }]
    expect(url).toBe('http://api.test/supply-types')
    expect(options.method).toBe('POST')
    expect(options.body).toEqual({
      supplyTypeName: 'Silla Ergo',
      supplyTypeTeleworkCategory: 'ergonomic_chair',
    })
  })

  it('el PUT manda solo la categoría y distingue null de ausente (CA-9)', async () => {
    await updateAssetTypeTeleworkCategory({
      ...params,
      supplyTypeId: 4,
      teleworkCategory: 'computing_equipment',
    })
    await updateAssetTypeTeleworkCategory({ ...params, supplyTypeId: 4, teleworkCategory: null })

    const [firstUrl, first] = fetchMock.mock.calls[0] as [string, { method: string; body: unknown }]
    const [, second] = fetchMock.mock.calls[1] as [string, { method: string; body: unknown }]
    expect(firstUrl).toBe('http://api.test/supply-types/4')
    expect(first.method).toBe('PUT')
    expect(first.body).toEqual({ supplyTypeTeleworkCategory: 'computing_equipment' })
    expect(second.body).toEqual({ supplyTypeTeleworkCategory: null })
  })
})
```

- [ ] **Step 2: Correr la prueba para verla fallar**

Run: `./node_modules/.bin/vitest run tests/supplies/asset-types-category.spec.ts`
Expected: FAIL — `updateAssetTypeTeleworkCategory` no existe y `mapType` no devuelve `teleworkCategory`.

- [ ] **Step 3: Enum de la categoría**

En `pages/supplies/domain/asset.enum.ts`:

```ts
/** Categorías de insumo de teletrabajo (NOM-037); las fija la norma. */
export const ASSET_TYPE_TELEWORK_CATEGORY = {
  ERGONOMIC_CHAIR: 'ergonomic_chair',
  COMPUTING_EQUIPMENT: 'computing_equipment',
  ACCESSORY: 'accessory',
} as const

export type AssetTypeTeleworkCategory =
  (typeof ASSET_TYPE_TELEWORK_CATEGORY)[keyof typeof ASSET_TYPE_TELEWORK_CATEGORY]
```

- [ ] **Step 4: Interfaz, repositorio y caso de uso**

En `pages/supplies/domain/asset.interface.ts`, en `AssetType` (`:80-85`) agregar `teleworkCategory: AssetTypeTeleworkCategory | null` e importar el tipo.

En `pages/supplies/infrastructure/asset-types.repository.ts`:
- `CreateAssetTypeParams` suma `teleworkCategory: AssetTypeTeleworkCategory | null`.
- `mapType`: leer la categoría anulando lo que no está en el catálogo ni es string:
  ```ts
  const CATEGORY_VALUES: readonly string[] = Object.values(ASSET_TYPE_TELEWORK_CATEGORY)
  // dentro de mapType:
  const teleworkCategory =
    typeof record.teleworkCategory === 'string' && CATEGORY_VALUES.includes(record.teleworkCategory)
      ? (record.teleworkCategory as AssetTypeTeleworkCategory)
      : null
  ```
  y agregar `teleworkCategory` al objeto de retorno.
- `createAssetType`: body `{ supplyTypeName: params.name, supplyTypeTeleworkCategory: params.teleworkCategory }`.
- Función nueva:
  ```ts
  /** Cambia o quita la categoría de teletrabajo de un tipo; manda solo ese campo. */
  export const updateAssetTypeTeleworkCategory = async (
    params: AssetTypeIdParams & { teleworkCategory: AssetTypeTeleworkCategory | null },
  ): Promise<void> => {
    await assetFetch(params, `/supply-types/${params.supplyTypeId}`, {
      method: 'PUT',
      body: { supplyTypeTeleworkCategory: params.teleworkCategory },
    })
  }
  ```
  **Sin `?? null` ni `|| undefined`:** distinguir ausente de `null` es parte del contrato.

En `pages/supplies/application/use-asset-types.ts`: `UseAssetTypesDeps.messages` suma `categoryUpdated: string`; `createType(name, teleworkCategory)` pasa `teleworkCategory` a `createAssetType`; agregar `updateTeleworkCategory(supplyTypeId, teleworkCategory)` sobre `run()` con `deps.messages.categoryUpdated`; exportarla en el objeto de retorno.

En `pages/supplies/script.ts`, en `messages` de `useAssetTypes` (`:97-104`) agregar `categoryUpdated: t('assets_page.telework_category_updated')`.

En `pages/supplies/domain/locales/supplies.es.json`: `"telework_category_updated": "Categoría actualizada."`. En `supplies.en.json`: `"telework_category_updated": "Category updated."`.

- [ ] **Step 5: Correr la prueba para verla pasar y la línea base**

Run: `./node_modules/.bin/vitest run tests/supplies/asset-types-category.spec.ts tests/supplies/supplies-permission-bindings.spec.ts`
Expected: PASS — 3 passed + 11 passed.
Run: `./node_modules/.bin/eslint pages/supplies`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add pages/supplies/domain/asset.enum.ts pages/supplies/domain/asset.interface.ts pages/supplies/infrastructure/asset-types.repository.ts pages/supplies/application/use-asset-types.ts pages/supplies/script.ts pages/supplies/domain/locales/supplies.es.json pages/supplies/domain/locales/supplies.en.json tests/supplies/asset-types-category.spec.ts
git commit -m "feat(activos): dominio y repositorio de la categoría de teletrabajo en el BO

Refs: VLRH-H1791306074983"
```

### Task 4: Selector y etiqueta de categoría en el drawer Tipos y características

**Files:**
- Modify: `components/assetTypesDrawer/index.vue`
- Modify: `components/assetTypesDrawer/script.ts`
- Modify: `components/assetTypesDrawer/style.scss`
- Modify: `components/assetTypesDrawer/domain/locales/asset-types-drawer.es.json` y `.en.json`
- Modify: `pages/supplies/index.vue` (`:183-195`, uso del drawer)
- Test: `tests/supplies/supplies-permission-bindings.spec.ts`

**Interfaces:**
- Consumes: de Task 3 — `ASSET_TYPE_TELEWORK_CATEGORY`, `AssetTypeTeleworkCategory`, `AssetType.teleworkCategory`, `useAssetTypes(...).createType(name, category)` y `.updateTeleworkCategory(id, category)`.
- Produces: el drawer emite `create-type` con `{ name, teleworkCategory }` y `update-telework-category` con `{ supplyTypeId, teleworkCategory }`.

- [ ] **Step 1: Escribir las pruebas de binding que fallan**

En `tests/supplies/supplies-permission-bindings.spec.ts` agregar la constante del drawer de tipos y tres casos al `describe('activos: cada accion cuelga del permiso que exige el API', ...)`:

```ts
const TYPES_DRAWER = 'components/assetTypesDrawer/index.vue'

it('el selector de categoría por tipo cuelga de update', () => {
  const select = findTag(TYPES_DRAWER, 'Select', 'updateTeleworkCategory')
  expect(select).toContain('v-if="canUpdate"')
})

it('el selector de categoría del alta cuelga de create', () => {
  const card = findTag(TYPES_DRAWER, 'Card', 'canCreate')
  expect(card).toBeDefined()
  expect(read(TYPES_DRAWER)).toContain('v-model="newTypeCategory"')
})

it('sin update la categoría se ve como etiqueta de solo lectura', () => {
  const tag = findTag(TYPES_DRAWER, 'Tag', 'type.teleworkCategory')
  expect(tag).toContain('v-else-if="type.teleworkCategory"')
})
```

- [ ] **Step 2: Correr las pruebas para verlas fallar**

Run: `./node_modules/.bin/vitest run tests/supplies/supplies-permission-bindings.spec.ts`
Expected: FAIL — no hay `<Select>`/`<Tag>` con esos marcadores en el drawer.

- [ ] **Step 3: Script del drawer**

En `components/assetTypesDrawer/script.ts`: importar `ASSET_TYPE_TELEWORK_CATEGORY` y `type AssetTypeTeleworkCategory`. Declarar `emits` sumando `'update-telework-category'`. Agregar:

```ts
const newTypeCategory = ref<AssetTypeTeleworkCategory | null>(null)

const teleworkCategoryOptions = computed(() => [
  { value: null, label: t('asset_types_drawer.telework_category.none') },
  ...Object.values(ASSET_TYPE_TELEWORK_CATEGORY).map((value) => ({
    value,
    label: t(`asset_types_drawer.telework_category.${value}`),
  })),
])

const categoryLabel = (value: AssetTypeTeleworkCategory): string =>
  t(`asset_types_drawer.telework_category.${value}`)

const updateTeleworkCategory = (type: AssetType, value: AssetTypeTeleworkCategory | null): void => {
  if (value === type.teleworkCategory) return
  emit('update-telework-category', { supplyTypeId: type.supplyTypeId, teleworkCategory: value })
}

const createType = (): void => {
  if (!newTypeName.value.trim()) return
  emit('create-type', { name: newTypeName.value, teleworkCategory: newTypeCategory.value })
  newTypeName.value = ''
  newTypeCategory.value = null
}
```

Exportar `newTypeCategory`, `teleworkCategoryOptions`, `categoryLabel`, `updateTeleworkCategory`. (Reemplaza el `createType` actual de `:91-95`.)

- [ ] **Step 4: Plantilla y estilos del drawer**

En `components/assetTypesDrawer/index.vue`, dentro de cada `Card` y **bajo la cabecera** (`asset-types-drawer__type-head`, cierra en `:43`), agregar:

```html
<Select
  v-if="canUpdate"
  :model-value="type.teleworkCategory"
  :options="teleworkCategoryOptions"
  option-label="label"
  option-value="value"
  :aria-label="$t('asset_types_drawer.telework_category.label')"
  class="asset-types-drawer__category"
  fluid
  size="large"
  @update:model-value="(value) => updateTeleworkCategory(type, value)"
/>
<Tag
  v-else-if="type.teleworkCategory"
  severity="secondary"
  class="asset-types-drawer__category-tag"
  :value="categoryLabel(type.teleworkCategory)"
/>
```

**Sin `v-model`:** el valor sale de `:model-value="type.teleworkCategory"`; un error del API no deja un valor falso en pantalla.

En el `Card v-if="canCreate"` (`:117-145`), junto al campo `asset-new-type`, agregar el selector del alta (default `null`):

```html
<div class="input-box asset-types-drawer__new-type-category">
  <label for="asset-new-type-category">{{ $t('asset_types_drawer.telework_category.label') }}</label>
  <Select
    id="asset-new-type-category"
    v-model="newTypeCategory"
    :options="teleworkCategoryOptions"
    option-label="label"
    option-value="value"
    fluid
    size="large"
  />
</div>
```

En `components/assetTypesDrawer/style.scss`: el `Select` por tipo ocupa el ancho completo bajo el nombre y en ancho de teléfono el bloque del alta apila el selector bajo el nombre.

- [ ] **Step 5: Locales del drawer**

En `components/assetTypesDrawer/domain/locales/asset-types-drawer.es.json` agregar:

```json
"telework_category": {
  "label": "Categoría de teletrabajo",
  "none": "Sin categoría",
  "ergonomic_chair": "Silla ergonómica",
  "computing_equipment": "Equipo de cómputo o impresión",
  "accessory": "Aditamento"
}
```

En `asset-types-drawer.en.json`:

```json
"telework_category": {
  "label": "Telework category",
  "none": "No category",
  "ergonomic_chair": "Ergonomic chair",
  "computing_equipment": "Computer or printing equipment",
  "accessory": "Accessory"
}
```

- [ ] **Step 6: Enlazar la página con el drawer**

En `pages/supplies/index.vue` (`:183-195`):

```html
@create-type="(draft) => types.createType(draft.name, draft.teleworkCategory)"
@update-telework-category="(change) => types.updateTeleworkCategory(change.supplyTypeId, change.teleworkCategory)"
```

(Reemplaza el `@create-type="types.createType"` actual.)

- [ ] **Step 7: Correr la suite del BO y las líneas base**

Run: `./node_modules/.bin/vitest run tests/supplies`
Expected: PASS — `asset-types-category.spec.ts` (3) + `supplies-permission-bindings.spec.ts` (14 = 11 + 3).
Run: `./node_modules/.bin/eslint components/assetTypesDrawer pages/supplies`
Expected: exit 0.

- [ ] **Step 8: Verificar la frontera con la vista por teletrabajador (CA-12)**

Run: `git diff --name-only multitenant...HEAD -- pages/telework-workers components/teleworkWorkerDrawer components/teleworkWorkerSuppliesSection`
Expected: salida vacía.

- [ ] **Step 9: Commit**

```bash
git add components/assetTypesDrawer pages/supplies/index.vue tests/supplies/supplies-permission-bindings.spec.ts
git commit -m "feat(activos): selector y etiqueta de la categoría de teletrabajo en el drawer

Refs: VLRH-H1791306074983"
```

---

# Repo 1 (docs): `gsti-rh-api`

### Task 5: Manual de QA de flujo (entrega, no recorrido)

**Files:**
- Create: `gsti-rh-api/docs/superpowers/plans/2026-10-08-marcar-categoria-teletrabajo-tipos-activo-qa-flujo.md`

**Interfaces:**
- Consumes: la pantalla entregada en Task 4 y los endpoints de Tasks 1-2.

- [ ] **Step 1: Leer las reglas y tomar las constantes del proyecto**

Leer las reglas de Cursor del manual de QA — `~/.cursor/rules/manual-qa-frontend.mdc` y `~/.cursor/rules/manual-qa-execution.mdc` (esa misma copia vive en `~/.agents/rules/manual-qa/`) — y el molde de la historia hermana `docs/superpowers/plans/2026-10-07-parametrizar-compensacion-teletrabajo-qa-flujo.md`. El manual se construye **en base a esa regla**: un objetivo por escenario, textos copiados del catálogo real, correos exactos del seeder, y la estructura mínima de la sección *Formato — manual de usuario*. Anotar del repo: URL local del BO y prefijo de idioma, flujo de login tal como se ve, y el comando del seeder QA (`NODE_ENV=test DB_DATABASE=sae_pruebas node ace db:seed`).

- [ ] **Step 2: Leer el seeder QA y ajustarlo si falta la cuenta**

Abrir `database/seeders/_tmp_do_not_commit_qa_seeder.ts` (no versionado; contraseña `password`). La HU necesita dos cuentas en una empresa con el módulo `supplies`: una con `supplies:update` y una solo con `supplies:read`. Si el bloque que ya crea cuentas de activos no las tiene, **agregarlas al seeder** (es su sitio) con correos `qa-supplies-<variante>@gsti-tests.local` y el rol correspondiente; el manual usa esos correos exactos. El sembrador de QA **no se versiona**.

- [ ] **Step 3: Escribir el manual (superficie de pantalla ⇒ manual de flujo)**

Estructura mínima, en español, para quien prueba en el navegador (sin rutas de archivo, sin `curl`, sin nombres de componente):

0. **Problema / Solución / Ejemplo** (+ glosario de términos de negocio: "Insumo de teletrabajo", "Aditamento", "Tipo de activo").
1. **Preparar** — un solo comando: el del seeder QA; y lo que el entorno debe traer (la historia desplegada; el módulo Activos e insumos).
2. **Usuarios** — tabla con los correos exactos del seeder y la contraseña `password`, declarando el estado inicial.
3. **Dónde probar** — menú **Empresa → Activos e insumos**, botón **Tipos y características**, con la URL.
4. **Usuario con `supplies:update`** — escenarios, **cada uno con su línea `Objetivo:` antes de los pasos**:
   - Marcar un tipo existente (elegir "Equipo de cómputo o impresión" en el selector de "Laptop") → objetivo: que la categoría se guarde sin renombrar el tipo y el catálogo la muestre.
   - Quitar la categoría (elegir "Sin categoría") → objetivo: que el tipo vuelva a quedar sin categoría y sus resguardos no cambien.
   - Alta con categoría ("Silla Ergo" + "Silla ergonómica") → objetivo: que el tipo nazca clasificado y el selector del alta se reinicie en "Sin categoría".
5. **Usuario solo con `supplies:read`** — objetivo: que vea la categoría como etiqueta y **no** aparezca el selector; y que un tipo previo sin categoría se vea igual que siempre.
6. **Lo que no se revisa aquí** — declarar no revisable y cubierto por las suites automatizadas: la categoría fuera del catálogo (422), el tipo de otra empresa o inexistente (404), el usuario sin `supplies:update` (403 del API), el aislamiento con otra empresa y el mapeo de la categoría en la respuesta.
7. **Checklist** final con el resultado por objetivo.

- [ ] **Step 4: Verificar el manual contra las reglas**

Comprobar que cada escenario abre con `Objetivo:`, que los textos de pantalla se copiaron del catálogo real (`asset-types-drawer.{es,en}.json`, `supplies.{es,en}.json`) y que los correos salen del seeder, no de memoria.

- [ ] **Step 5: Commit (manual entregado, no recorrido)**

```bash
git add docs/superpowers/plans/2026-10-08-marcar-categoria-teletrabajo-tipos-activo-qa-flujo.md
git commit -m "docs(activos): manual de QA de la categoría de teletrabajo en los tipos de activo

Refs: VLRH-H1791306074983"
```

---

## Definition of Done (del spec §16)

- [ ] CA-1 a CA-12 verificados (CA-8 y CA-11 por las suites/greps existentes; CA-5 por la suite del grupo; CA-9/CA-10 por el spec BO y su binding).
- [ ] Migración corre y revierte en `sae_pruebas` (Task 1, Step 7).
- [ ] `tests/functional/assets_module.spec.ts` y `tests/functional/supplies_permission_gate.spec.ts` en verde.
- [ ] BO: `tests/supplies/asset-types-category.spec.ts` (nuevo) y `tests/supplies/supplies-permission-bindings.spec.ts` en verde; eslint acotado a los slices en 0.
- [ ] Cero `any`; literales de categoría solo en la constante (API), el enum del BO y la migración.
- [ ] Manual de QA entregado (`docs/superpowers/plans/2026-10-08-...-qa-flujo.md`), recorrido por una persona.
- [ ] Diff de cada repo dentro del censo (CA-12).
