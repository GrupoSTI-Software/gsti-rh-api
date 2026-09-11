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

- Correr `DB_DATABASE=<bd_desechable> node ace migration:fresh --seed` sobre una base de datos DESECHABLE. Nunca contra la BD de desarrollo compartida.
- `migration:run` incremental NO detecta errores de orden: sobre una BD que ya tiene todo aplicado, la columna o tabla que tu migración necesita ya existe porque se creó en otra secuencia. Solo el `fresh` reproduce el orden que verá un entorno nuevo.
- Una migración que depende de una columna, tabla o fila creada por otra migración de la misma tanda debe verificarse con `fresh`, no con `run`.

### Catálogo (módulos, permisos, roles): no insertar a ciegas desde migraciones

- `system_modules`, `system_permissions` y sus relaciones son CATÁLOGO, no esquema. Un `INSERT` sin id explícito desde una migración toma el `AUTO_INCREMENT` disponible: sobre una BD vacía (`fresh`) eso es el id 1, que `database/seeders/0017_system_module_seeder.ts` reclama para otro módulo con id fijo y sobrescribe. Así se perdía el módulo Calendario en cada entorno nuevo.
- Mientras el alta de módulos siga repartida entre migraciones y seeders: una migración que inserte catálogo debe hacerlo con id explícito fuera del rango que reclaman los seeders, o declararse directamente en el seeder correspondiente.
- Toda migración que toque catálogo debe ser idempotente (`WHERE NOT EXISTS` o equivalente) y verificarse con `migration:fresh --seed`, no solo con `migration:fresh` sin seeders.

## node_modules — intocable para agentes

Los agentes (Claude Code, Cursor o cualquier asistente de IA) no deben ni pueden modificar, crear ni renombrar archivos dentro de `node_modules/` ni de ningún directorio de dependencias instaladas.

- `node_modules/` es artefacto de instalación: se regenera con el package manager y cualquier edición manual se pierde en el siguiente install, creando divergencia silenciosa entre entornos.
- Un fix a una dependencia va por `package.json` (cambio de versión, `overrides`) o `patch-package` — nunca editando el paquete instalado.
- Sobre `node_modules/` solo se permite lectura (inspeccionar código de dependencias) y regeneración completa vía el package manager (`npm install`, `npm ci`).
- Única excepción: invalidar caches de build (`node_modules/.cache` y similares) cuando el usuario lo autorice explícitamente en la sesión.
