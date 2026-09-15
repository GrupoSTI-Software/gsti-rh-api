# Reglas del proyecto — valanserh-api

@.claude/rules/design-principles.md

## Migraciones (AdonisJS Lucid)

### Nunca `await` sobre `this.schema`

- NUNCA usar `await` con `this.schema` dentro de `up()`/`down()`: el getter `schema` registra cada builder y Lucid los ejecuta de forma diferida al terminar el método; como los builders de Knex son thenables, el `await` manual provoca que el SQL se ejecute DOS VECES.
- Síntoma de la doble ejecución: los `ALTER MODIFY` pasan en silencio (idempotentes), pero los `ADD COLUMN` fallan con "Duplicate column name" y dejan columnas huérfanas (creadas en BD pero sin registro en `adonis_schema`).
- Correcto: `this.schema.alterTable(...)` / `this.schema.raw(...)` sin `await`. El orden entre varias llamadas se respeta (se ejecutan en secuencia al terminar `up()`).
- Incorrecto: `await this.schema.alterTable(...)`
- Si al migrar aparece "Duplicate column name", sospechar de columna huérfana: comparar `SHOW COLUMNS` contra `adonis_schema`; si la columna coincide con lo que crearía la migración, registrarla manualmente con `INSERT` en `adonis_schema` en lugar de eliminarla.

### El nombre del archivo decide el orden de ejecución

- Lucid ordena las migraciones por el NOMBRE del archivo, no por fecha de creación ni por commit. `config/database.ts` usa `naturalSort: false`: la comparación es lexicográfica, carácter por carácter.
- Crear siempre la migración con `node ace make:migration <nombre>`. Genera el prefijo correcto de 13 dígitos (milisegundos). NUNCA escribir el timestamp a mano.
- El prefijo debe tener EXACTAMENTE 13 dígitos. Un prefijo de 16 dígitos (microsegundos) rompe el orden: con `naturalSort: true` Lucid lo comparaba como número entero, resultaba ~1000 veces mayor que uno de 13 dígitos y mandaba el archivo al final de toda la cola. Así quedaron 33 archivos en el repo (`1786566437097000_*` en adelante); no agregar más.
- Para encadenar varias migraciones de un mismo cambio, repetir el prefijo de 13 dígitos con sufijo incremental del MISMO largo: `1788912000001_`, `1788912000002_`. Nunca mezclar largos de prefijo.
- Todo archivo de `database/migrations/` lleva prefijo numérico. Sin prefijo ordena después de todos los demás (en ASCII las letras van después de los dígitos).

### Una migración ya mergeada no se renombra

- El nombre del archivo es la clave con la que Lucid registra la migración en `adonis_schema`. Renombrarla la vuelve "nueva" para Lucid, que la ejecuta otra vez y revienta toda BD donde ya había corrido: locales del equipo, staging y producción.
- Si un prefijo quedó mal y la migración ya está en una rama compartida, el orden se corrige por otra vía (configuración, o una migración correctiva). Renombrar no es una opción.

### Verificación obligatoria antes de abrir PR

- Correr `NODE_ENV=test DB_DATABASE=valanserh_test node ace migration:fresh --seed` sobre la BD desechable `valanserh_test`, la misma que `.env.test` fija para la suite. Nunca contra la BD de desarrollo compartida.
- `node ace test` fija `NODE_ENV=test` y lee `.env.test` por su cuenta; `node ace migration:*`, `db:seed` y los demás comandos no. Sin `NODE_ENV=test DB_DATABASE=valanserh_test` delante caen en la BD de `.env`. Otra BD u otro puerto personal van en `.env.test.local`, que no se versiona.
- Nunca correr dos migraciones a la vez, ni siquiera contra BD distintas del mismo servidor: Lucid toma `GET_LOCK('1', 0)` de MySQL, un candado global a todo el servidor, y la segunda falla al instante con `E_UNABLE_ACQUIRE_LOCK` ("Concurrent migrations are not allowed").
- `migration:run` incremental NO detecta errores de orden: sobre una BD que ya tiene todo aplicado, la columna o tabla que tu migración necesita ya existe porque se creó en otra secuencia. Solo el `fresh` reproduce el orden que verá un entorno nuevo.
- Una migración que depende de una columna, tabla o fila creada por otra migración de la misma tanda debe verificarse con `fresh`, no con `run`.

### Catálogo (módulos, grupos, permisos): fuente única en la constante

- `system_module_groups`, `system_modules` y `system_permissions` son CATÁLOGO, no esquema. Su única fuente es `app/constants/system_modules_menu/system_modules.constant.ts`. Cómo agregar, renombrar o dar de baja un módulo o permiso está en la cabecera de ese archivo; no se repite aquí.
- La siembra resuelve todo por slug (`app/helpers/system_catalog_seed_resolver.ts`): `0061_system_module_group_seeder` crea los grupos y `0062_system_module_seeder` los módulos, sus permisos y las bajas. El id lo asigna la BD.
- Prohibido: `INSERT`/`UPDATE`/`DELETE` de filas de catálogo en migraciones, ids literales de módulo, permiso o rol, y seeders por módulo. Los seeders con id fijo se pisaban entre sí y un `INSERT` sin id desde una migración tomaba un id que otro seeder reclamaba: así se perdían módulos como Calendario en cada entorno nuevo. Las migraciones que sembraban catálogo quedan como NO-OP históricas.
- Una concesión que ningún atajo de rol cubre y que nadie puede darse desde Roles y permisos se declara por slug (rol, módulo, permiso) en `0063_system_role_permission_seeder`.
- Todo cambio de catálogo se verifica con `NODE_ENV=test DB_DATABASE=valanserh_test node ace migration:fresh --seed` y después `NODE_ENV=test DB_DATABASE=valanserh_test node ace permissions:check-consistency`, que debe terminar sin hallazgos (código de salida 0).

## node_modules — intocable para agentes

Los agentes (Claude Code, Cursor o cualquier asistente de IA) no deben ni pueden modificar, crear ni renombrar archivos dentro de `node_modules/` ni de ningún directorio de dependencias instaladas.

- `node_modules/` es artefacto de instalación: se regenera con el package manager y cualquier edición manual se pierde en el siguiente install, creando divergencia silenciosa entre entornos.
- Un fix a una dependencia va por `package.json` (cambio de versión, `overrides`) o `patch-package` — nunca editando el paquete instalado.
- Sobre `node_modules/` solo se permite lectura (inspeccionar código de dependencias) y regeneración completa vía el package manager (`npm install`, `npm ci`).
- Única excepción: invalidar caches de build (`node_modules/.cache` y similares) cuando el usuario lo autorice explícitamente en la sesión.

## Retiro de archivos → `__TO_DELETE__/`

Nada se borra ni se renombra con prefijo. Todo archivo o carpeta que se retira del código se **mueve** a `__TO_DELETE__/` en la raíz del repo, conservando su ruta relativa original (sin prefijos): `app/modules/foo/foo.service.ts` → `__TO_DELETE__/app/modules/foo/foo.service.ts`. Willy revisa esa carpeta y la elimina desde Finder.

- Si el archivo está versionado, se mueve con `git mv` para conservar su historial. Si ya existe algo en el destino, se agrega un sufijo numérico (`-2`, `-3`).
- Antes de moverlo se cortan todos sus imports y referencias vivas. Nada dentro de `__TO_DELETE__/` se importa, se compila, se lintea ni se prueba: la carpeta está excluida de la herramienta del repo.
- Una carpeta que queda vacía por el retiro se mueve también.
- El prefijo `__DELETED__` queda obsoleto: no se usa en código nuevo. Si una rama integrada trae archivos `__DELETED__`, se mueven aquí al integrarla.
- La regla aplica a archivos y carpetas completos. Quitar código muerto dentro de un archivo que sigue en uso no es un retiro.
