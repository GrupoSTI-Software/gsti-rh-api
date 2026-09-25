# Migraciones (AdonisJS Lucid)

## Nunca `await` sobre `this.schema`

- NUNCA usar `await` con `this.schema` dentro de `up()`/`down()`: el getter `schema` registra cada builder y Lucid los ejecuta de forma diferida al terminar el método; como los builders de Knex son thenables, el `await` manual provoca que el SQL se ejecute DOS VECES.
- Síntoma de la doble ejecución: los `ALTER MODIFY` pasan en silencio (idempotentes), pero los `ADD COLUMN` fallan con "Duplicate column name" y dejan columnas huérfanas (creadas en BD pero sin registro en `adonis_schema`).
- Correcto: `this.schema.alterTable(...)` / `this.schema.raw(...)` sin `await`. El orden entre varias llamadas se respeta (se ejecutan en secuencia al terminar `up()`).
- Incorrecto: `await this.schema.alterTable(...)`
- Si al migrar aparece "Duplicate column name", sospechar de columna huérfana: comparar `SHOW COLUMNS` contra `adonis_schema`; si la columna coincide con lo que crearía la migración, registrarla manualmente con `INSERT` en `adonis_schema` en lugar de eliminarla.

## El nombre del archivo decide el orden de ejecución

- Lucid ordena las migraciones por el NOMBRE del archivo, no por fecha de creación ni por commit. `config/database.ts` usa `naturalSort: false`: la comparación es lexicográfica, carácter por carácter.
- Crear siempre la migración con `node ace make:migration <nombre>`. Genera el prefijo correcto de 13 dígitos (milisegundos). NUNCA escribir el timestamp a mano.
- El prefijo debe tener EXACTAMENTE 13 dígitos. Un prefijo de 16 dígitos (microsegundos) rompe el orden: con `naturalSort: true` Lucid lo comparaba como número entero, resultaba ~1000 veces mayor que uno de 13 dígitos y mandaba el archivo al final de toda la cola. Así quedaron 33 archivos en el repo (`1786566437097000_*` en adelante); no agregar más.
- Para encadenar varias migraciones de un mismo cambio, repetir el prefijo de 13 dígitos con sufijo incremental del MISMO largo: `1788912000001_`, `1788912000002_`. Nunca mezclar largos de prefijo.
- Todo archivo de `database/migrations/` lleva prefijo numérico. Sin prefijo ordena después de todos los demás (en ASCII las letras van después de los dígitos).

## Una migración ya mergeada no se renombra

- El nombre del archivo es la clave con la que Lucid registra la migración en `adonis_schema`. Renombrarla la vuelve "nueva" para Lucid, que la ejecuta otra vez y revienta toda BD donde ya había corrido: locales del equipo, staging y producción.
- Si un prefijo quedó mal y la migración ya está en una rama compartida, el orden se corrige por otra vía (configuración, o una migración correctiva). Renombrar no es una opción.

## Migraciones y catálogo

Una migración NUNCA siembra ni modifica filas de `system_module_groups`, `system_modules` ni
`system_permissions`. Ver `catalogo-modulos-permisos.md`.

## Verificación obligatoria antes de abrir PR

- Correr `NODE_ENV=test DB_DATABASE=sae_pruebas node ace migration:fresh --seed` sobre la BD desechable `sae_pruebas`, la misma que `.env.test` fija para la suite. Nunca contra la BD de desarrollo compartida.
- `node ace test` fija `NODE_ENV=test` y lee `.env.test` por su cuenta; `node ace migration:*`, `db:seed` y los demás comandos no. Sin `NODE_ENV=test DB_DATABASE=sae_pruebas` delante caen en la BD de `.env`. Otra BD u otro puerto personal van en `.env.test.local`, que no se versiona; quien lo use cambia también el nombre de la BD en estos comandos, porque una variable en línea gana sobre cualquier archivo `.env` y `DB_DATABASE=sae_pruebas` ignoraría la de `.env.test.local`.
- Nunca correr dos migraciones a la vez, ni siquiera contra BD distintas del mismo servidor: Lucid toma `GET_LOCK('1', 0)` de MySQL, un candado global a todo el servidor, y la segunda falla al instante con `E_UNABLE_ACQUIRE_LOCK` ("Concurrent migrations are not allowed").
- `migration:run` incremental NO detecta errores de orden: sobre una BD que ya tiene todo aplicado, la columna o tabla que tu migración necesita ya existe porque se creó en otra secuencia. Solo el `fresh` reproduce el orden que verá un entorno nuevo.
- Una migración que depende de una columna, tabla o fila creada por otra migración de la misma tanda debe verificarse con `fresh`, no con `run`.
