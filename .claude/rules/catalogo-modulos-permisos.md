# Catálogo de módulos, grupos y permisos — fuente única

`system_module_groups`, `system_modules` y `system_permissions` son CATÁLOGO, no esquema.
Su única fuente es `app/constants/system_modules_menu/system_modules.constant.ts`.
Cómo agregar, renombrar o dar de baja un módulo o permiso está en la cabecera de ese
archivo; no se repite aquí.

## La regla, en una línea

Todo lo que responda "qué módulos, grupos y permisos existen" se declara en la constante
y **se deriva por código**. Nada se copia, se enumera aparte ni se escribe a mano en otro lugar.

## Prohibido (sin excepciones)

- **Crear un archivo nuevo que enumere módulos, grupos o permisos.** Ni constante, ni enum,
  ni `type` con la unión de slugs, ni mapa, ni JSON, ni seeder, ni tabla en un `.md`. Si hace
  falta una vista distinta del catálogo, se **deriva** de `SYSTEM_MODULES` con una función.
  Una lista escrita a mano se desincroniza el día que alguien toca la constante y nadie se entera.
- **`INSERT` / `UPDATE` / `DELETE` de filas de catálogo en migraciones.** Las migraciones que
  sembraban catálogo quedan como NO-OP históricas; no se agregan nuevas.
- **Ids literales** de módulo, permiso o rol en cualquier archivo. El id lo asigna la BD; la
  identidad estable es el **slug**.
- **Seeders por módulo.** Los seeders con id fijo se pisaban entre sí y un `INSERT` sin id desde
  una migración tomaba un id que otro seeder reclamaba: así se perdían módulos como Calendario
  en cada entorno nuevo.
- **Slugs de módulo o permiso escritos a mano** fuera de los archivos autorizados de abajo:
  nada de `module: 'employees'` en una ruta, `=== 'calendar'` en un service, ni el slug
  interpolado en un string. Se importa la declaración que ya existe.

## Los únicos archivos satélite permitidos, y qué hace cada uno

No hay más. Si tu cambio parece pedir uno nuevo, el cambio va en la constante o en el catálogo
de acciones del módulo.

| Archivo | Rol | Puede declarar |
|---|---|---|
| `app/constants/system_modules_menu/system_modules.constant.ts` | Fuente única: qué existe | Todo |
| `app/constants/<modulo>_permission_catalog.ts` | Acciones tipadas de un módulo con permisos granulares; la constante **deriva** sus permisos de aquí vía `permissionsFromActionCatalog` | Acciones del módulo **y el nombre de sus secciones** (`<MODULO>_SECTION_LABELS`) |
| `app/constants/<modulo>_permission_declarations.ts` | Qué ruta exige qué permiso; lo consumen los archivos de `start/routes/` | Solo consume slugs ya declarados |
| `app/constants/system_modules_catalog.ts`, `system_permission_catalog.ts`, `tenant_provisioned_roles.ts` | Vistas derivadas (árbol de sesión, índice maestro, provisión de roles) | Nada: derivan |
| `app/helpers/system_catalog_seed_resolver.ts` | Resuelve todo por slug al sembrar | Nada: resuelve |
| `database/seeders/0061` / `0062` / `0063` | Llevan grupos, módulos, permisos y bajas a la BD | Nada: leen la constante |

Una concesión que ningún atajo de rol cubre y que nadie puede darse desde Roles y permisos se
declara **por slug** (rol, módulo, permiso) en `0063_system_role_permission_seeder`.

## El catálogo también dice cómo se llaman las cosas

Los clientes (backoffice, app del colaborador) **no traducen** slugs: pintan el nombre que este
repo les sirve. Por eso el nombre visible es parte del catálogo, no de cada cliente.

- El nombre de una **acción** es su `displayName` en el catálogo del módulo.
- El nombre de una **sección** vive en `<MODULO>_SECTION_LABELS`, en el mismo
  `<modulo>_permission_catalog.ts` que declara sus acciones, y se registra en
  `SYSTEM_MODULE_SECTION_LABELS`. Se sirve como `displayName` de la sección en el árbol de
  sesión y como `sectionDisplayName` en los permisos de una plantilla.
- El nombre de un **módulo** es su `systemModuleName`, y se deriva con
  `resolveModuleDisplayName`. Nunca se transcribe.

**Toda tabla de etiquetas se declara con `satisfies Record<<Modulo>Section, string>`.** Esa línea
es la que convierte "olvidé nombrar la sección nueva" en un error de compilación; sin ella el
cliente muestra el slug humanizado y nadie se entera hasta que alguien lo ve en pantalla. Así
acabó la matriz de roles enseñando "Nomina" sin acento y "Salary Ranges" en inglés.

`tests/unit/constants/system_module_section_labels.spec.ts` cierra el resto: ninguna sección sin
nombre, ninguna etiqueta huérfana, ningún nombre que parezca un slug.

**La terminología del producto se decide aquí.** Si un `displayName` dice "colaborador" y el
producto dice "empleado", el cambio va en el catálogo: alinea a todos los clientes de una vez.
Pedirle a un cliente que lo traduzca reintroduce el diccionario que este contrato eliminó.

## Los roles que cada empresa estrena al nacer

`TENANT_PROVISIONED_ROLES` (`owner`, `admin`, `empleado`) no son catálogo de módulos, pero
comparten su regla: **el runtime decide por slug**, así que su identidad no se toca. Las guardas
viven en `app/helpers/system_role_lock.ts` y todo endpoint que edite, elimine o reasigne permisos
de un rol las aplica:

- `owner` y `empleado` no se editan ni reciben permisos.
- Ninguno de los tres se elimina.
- `admin` no se renombra, pero sus permisos sí se ajustan.

Un endpoint nuevo que toque roles sin pasar por esas guardas deja a una empresa sin quién
administre, sin quién facture o sin rol que asignar en el alta self-service, y sin forma de
repararlo desde la aplicación.

## Antes de crear cualquier archivo, pregúntate

1. ¿Este archivo contiene el nombre, slug, id, icono, ruta, orden o permiso de un módulo?
   → **No lo crees.** Va en la constante.
2. ¿Necesito la lista de módulos con otra forma (filtrada, agrupada, indexada)?
   → Escribe una función que la derive de `SYSTEM_MODULES`. No la transcribas.
3. ¿Estoy por escribir un slug entre comillas?
   → Importa la declaración de `#constants/<modulo>_permission_declarations` o el catálogo
     de acciones del módulo.

## Verificación obligatoria

Antes de abrir PR con cualquier cambio de catálogo, en este orden:

```
node ace test unit --files="constants/"
NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed
NODE_ENV=test DB_DATABASE=sae_pruebas node ace permissions:check-consistency
```

Los tres deben terminar con código de salida 0 y `check-consistency` sin hallazgos.

El primero corre en `pre-push` y en el workflow `catalogo-modulos-permisos` de GitHub Actions:
no es opcional ni negociable. `tests/unit/constants/system_modules_constant.spec.ts` valida,
entre otras cosas, que **toda ruta tome su declaración del gate de un import de
`#constants/*_permission_declarations`**: un slug escrito a mano en una ruta truena el push.
