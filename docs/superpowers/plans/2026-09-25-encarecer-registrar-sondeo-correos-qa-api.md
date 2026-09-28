# Prueba manual API — El sondeo de correos personales se corta, queda registrado y no estorba la captura

**Problema:** el correo personal es único en toda la plataforma (puede ser la credencial de acceso), así que probar correos uno tras otro contra el alta o la edición es una forma de averiguar cuáles ya están registrados: el sistema contesta distinto según el correo esté libre o ya lo tenga alguien. Sin costo, cualquiera recorre una lista y se queda con el mapa de quién tiene qué. Y sin rastro, ese recorrido no se puede reconocer después ni atribuir a un cliente con nombre.

**Solución:** el sistema le pone costo y memoria al sondeo. Cada intento que carga un correo personal cuenta para un contador de 20 por hora **por persona**; al pasar el corte, la persona recibe un aviso propio —distinto del rechazo por correo ya registrado— que no confirma nada. El corte llega **igual** si los correos probados estaban libres o ya registrados: no distingue a quien probó veinte correos distintos de quien capturó quince trabajadores. Cada intento queda en una bitácora con quién lo hizo, desde qué empresa y cuándo, sin guardar nunca el correo legible.

Ejemplo: es como una tienda que, si pasas más de veinte tarjetas en una hora, te pide esperar antes de seguir pasando tarjetas —sin decirte si alguna existe ni de quién es—, y que anota en su libro "alguien de la sucursal X pasó veinte tarjetas a las 10:30", con un código de cada tarjeta, no el número.

(Se prueba con Postman, Insomnia o Bruno. URL base `http://127.0.0.1:3333`. La autenticación se asume resuelta por tu cliente.)

## 1. Preparar

```bash
cd gsti-rh-api
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Este seeder es temporal y **NO se commitea** (el nombre lo dice y el repo lo ignora con `.git/info/exclude`). Volver a correrlo restaura lo que el recorrido ensucie en las dos empresas de prueba.

Deja listas dos empresas (A y B): un capturista en A y **dos** en B —el segundo existe para probar que el corte es por persona y no por empresa—, en A el expediente dueño del correo ocupado `qa-correo-ocupado@gsti-tests.local`, y en B un expediente propio con el correo libre `qa-correo-libre-b@gsti-tests.local`.

| | Correo | Contraseña | Empresa |
|---|---|---|---|
| **A** | `qa-correo-capturista-a@gsti-tests.local` | `password` | Empresa A |
| **B** | `qa-correo-capturista-b@gsti-tests.local` | `password` | Empresa B |
| **B2** | `qa-sondeo-capturista-b2@gsti-tests.local` | `password` | Empresa B (la misma de B) |

Identificadores públicos de las dos empresas, para el header `X-Business-Unit-Id`:

```sql
SELECT business_unit_slug, business_unit_public_id FROM business_units WHERE business_unit_slug IN ('qa-correo-a', 'qa-correo-b');
```

Identificador del expediente propio de B (el correo va protegido en la base, así que se localiza por su nombre):

```sql
SELECT person_id FROM people WHERE person_second_lastname = 'Correo' AND person_lastname = 'CorreoLibreB';
```

Los escenarios 1 a 7 se recorren con un cliente HTTP; los escenarios 8, 9 y 10 consultan la bitácora directamente en Mongo (ver "Cómo llegar a la bitácora", abajo).

### Cómo llegar a la bitácora (base y colección)

La bitácora no tiene pantalla. Para verla hay que **elegir base y colección**, y si te quedas en la base equivocada la consulta es válida pero no devuelve nada:

- **Base:** `sae_rh` (es la variable `MONGODB_DB_NAME` de tu `.env`).
- **Colección:** `log_person_email_probes`, **en plural**: Mongoose pluraliza el nombre que usa el código. La forma en singular (`log_person_email_probe`) no existe y no trae nada.

Con `mongosh`:

```bash
mongosh "mongodb://gsti:<tu contraseña de Mongo>@localhost:27017/sae_rh?authSource=admin"
```

Conectado así, la base ya viene seleccionada. Compruébalo antes de consultar:

```js
db                 // debe responder: sae_rh
show collections   // debe aparecer entre ellas: log_person_email_probes
```

Si te conectaste sin la base en la URL, elígela primero:

```js
use sae_rh
```

En un cliente gráfico (Compass, Studio 3T, o el que uses): conéctate con esa misma URL, abre la base `sae_rh` y, dentro, la colección `log_person_email_probes`. Ahí el filtro va **solo como documento**, sin `db.`, sin el nombre de la colección y sin `.find(...)`: el filtro de cada escenario, tal cual, sin esa envoltura. El del primer escenario que consulta la bitácora, por ejemplo, queda así:

```
{ actor_user_id: 53 }
```

Los identificadores de los capturistas se obtienen con SQL, en el escenario que los necesita (el 8 lo hace para B). En la corrida con la que se escribió este manual dieron **A = 52, B = 53, B2 = 54**; si tu base se sembró de nuevo, confírmalos con esa consulta en vez de reusar los números.

### Cómo se distingue un corte de un rechazo

Un `429` del sondeo y un `422` de correo ya registrado se distinguen **por el `code` y por las cabeceras, nunca por el mensaje**:

| | `429` del sondeo (o del piso) | `422` del correo ya registrado |
|---|---|---|
| `code` | `PERSON.IDENTITY.006` | `PERSON.IDENTITY.005` |
| Cabeceras | `Retry-After` + las tres `X-RateLimit-*` | ninguna cabecera de límite |
| Qué dice | "Demasiados intentos…", sin mencionar el correo | "No es posible registrar ese correo…" |

El `201` del alta y de la edición tampoco traen cabeceras de límite. Tenlo a la mano en cada escenario: el cuerpo del corte es deliberadamente indistinguible entre contadores, y lo que separa un corte del sondeo (20) del piso de escritura (40) es `X-RateLimit-Limit`.

### Cómo se reinicia el contador

El contador **vive en memoria del proceso del servidor** (no en la base de datos), así que:

- **Reiniciar el proceso** lo borra por completo (sondeo, techo por empresa y piso de escritura). Es el camino práctico cuando un escenario se contamina: detén el servidor y vuélvelo a levantar.
- **Sin reiniciar**, el corte se rearma solo al pasar la ventana: el del sondeo es de 1 hora y no es un bloqueo permanente; el piso de escritura es de 1 minuto.

Los escenarios que necesitan un contador limpio lo dicen en su primer paso.

### Correos de prueba

Los correos libres de este manual llevan una marca `<fecha-hora>` (por ejemplo `2026-09-25-1030`). **Úsala distinta en cada corrida**: un correo ya capturado en una corrida anterior queda ocupado y respondería `422` en vez de `201`. El correo ocupado `qa-correo-ocupado@gsti-tests.local` sí se repite a propósito: se rechaza y no se guarda.

## 2. Escenario 1 (CA-1/CA-3) — El sondeo en serie se corta

Usuario: **B**. Reinicia el servidor antes de empezar.

Objetivo: veinte intentos de captura con correos distintos —mitad libres, mitad el correo ocupado— proceden cada uno con su respuesta estándar; el intento 21 recibe el corte, y el corte no menciona el correo.

**Endpoint:** `POST /api/persons`

Headers: `Authorization: Bearer <token de B>`, `X-Business-Unit-Id: <identificador público de B>`

Diez altas con correos libres distintos → `201`:

```json
{
  "personFirstname": "QA",
  "personLastname": "SondeoLibre",
  "personSecondLastname": "Correo",
  "personEmail": "qa-sondeo-libre-<fecha-hora>-<n>@gsti-tests.local"
}
```

Diez altas con el correo ocupado `qa-correo-ocupado@gsti-tests.local` (el mismo las diez veces: se rechaza, no se guarda) → `422`:

```json
{
  "personFirstname": "QA",
  "personLastname": "SondeoOcupado",
  "personSecondLastname": "Correo",
  "personEmail": "qa-correo-ocupado@gsti-tests.local"
}
```

**Response exacto del `201`** (los diez libres):

```json
{
  "type": "success",
  "title": "Persons",
  "message": "The person was created successfully",
  "data": { "person": { "personId": 123, "personFirstname": "QA", "...": "..." } }
}
```

**Response exacto del `422`** (los diez ocupados):

```json
{
  "title": "No es posible registrar ese correo",
  "detail": "La política de la plataforma no permite registrar ese correo en este expediente. Captura otro correo personal, o deja el campo vacío: el acceso a la aplicación puede otorgarse con el correo institucional del trabajador.",
  "key": "no-es-posible-registrar-ese-correo",
  "code": "PERSON.IDENTITY.005"
}
```

**Intento 21** (`POST /api/persons` con cualquier correo, libre u ocupado) → **`429`**:

```json
{
  "title": "Demasiados intentos de captura de correo",
  "detail": "Superaste el límite de capturas permitidas en este periodo. Espera un momento e intenta de nuevo. Para dar de alta a varias personas, usa la carga masiva desde archivo.",
  "key": "demasiados-intentos-de-captura-de-correo",
  "code": "PERSON.IDENTITY.006"
}
```

Cabeceras del `429`:

```
X-RateLimit-Limit: 20
X-RateLimit-Remaining: 0
Retry-After: 3600
X-RateLimit-Reset: 2026-09-25T17:20:31.000Z
```

Qué significa cada dato:
- `title`: qué pasó, en palabras del negocio.
- `detail`: qué hacer (esperar e intentar de nuevo; para varias altas, la carga masiva desde archivo).
- `key`: la clave estable del corte (siempre la misma).
- `code`: el código interno del catálogo (`PERSON.IDENTITY.006`).
- `X-RateLimit-Limit`: cuántos intentos permite el contador que cortó (20 el del sondeo).
- `X-RateLimit-Remaining`: cuántos quedan (0 cuando ya se cortó).
- `Retry-After`: los segundos que hay que esperar (3600 = la hora de bloqueo).
- `X-RateLimit-Reset`: el instante en que se rearma.

El cuerpo del `429` no trae el correo probado, ni la palabra `registrado`, ni `sondeo`, ni cuál de los contadores se topó. Compruébalo: busca en el cuerpo el correo que acabas de enviar y no aparece.

## 3. Escenario 2 (CA-2) — El corte llega igual con puros aciertos

Usuario: **A** (no lo usó el Escenario 1, así que su contador está limpio; si dudas, reinicia).

Objetivo: lo que más importa — el corte no distingue si los intentos anteriores acertaron. Veintiún altas, todas con correos libres y válidos.

**Endpoint:** `POST /api/persons`

Headers: `Authorization: Bearer <token de A>`, `X-Business-Unit-Id: <identificador público de A>`

```json
{
  "personFirstname": "QA",
  "personLastname": "SondeoAcierto",
  "personSecondLastname": "Correo",
  "personEmail": "qa-sondeo-acierto-<fecha-hora>-<n>@gsti-tests.local"
}
```

**Response exacto:** los primeros 20 → `201` (la forma de éxito del Escenario 1), el 21 → `429` con el **mismo cuerpo y las mismas cabeceras** del Escenario 1.

Compáralos: byte a byte son idénticos al corte del Escenario 1, aunque aquí los veinte intentos anteriores fueron aciertos. Si el corte se acercara solo con los intentos que chocan, el aviso delataría que los correos ocupados existen; por eso acertar y fallar cuentan igual.

## 4. Escenario 3 (CA-5) — La operación diaria no se estorba

Objetivo: quince altas normales no se topan con el límite, ni sin correo ni con correos libres.

**Parte A — sin correo.** Usuario: **B** (el que quedó cortado en el Escenario 1).

**Endpoint:** `POST /api/persons`

Headers: `Authorization: Bearer <token de B>`, `X-Business-Unit-Id: <identificador público de B>`

Quince altas **sin** `personEmail`:

```json
{ "personFirstname": "QA", "personLastname": "DiariaSinCorreo", "personSecondLastname": "Correo" }
```

**Response exacto:** los quince `201`, ninguno `429`. Una captura sin correo no es un intento de sondeo: ni cuenta ni se registra. Fíjate que funciona incluso con el capturista ya cortado en el sondeo.

**Parte B — con correos libres.** Reinicia el servidor. Usuario: **B**.

Quince altas con correos libres distintos (`qa-sondeo-diaria-<fecha-hora>-<n>@gsti-tests.local`).

**Response exacto:** los quince `201`, ninguno `429`, ninguno con cabeceras de límite. Quince intentos quedan muy por debajo del corte de veinte: la captura diaria con correo no se estorba.

## 5. Escenario 4 (CA-10) — El correo vacío no es intento

Usuario: **B** (con el contador como quedó en el Escenario 3, parte B: 15 de 20).

Objetivo: un correo vacío, ausente o en blanco no consume cuota ni deja rastro.

**Endpoint:** `POST /api/persons`

Headers: `Authorization: Bearer <token de B>`, `X-Business-Unit-Id: <identificador público de B>`

Tres altas: una con `"personEmail": ""`, otra **sin** el campo, y otra con `"personEmail": "   "`.

```json
{ "personFirstname": "QA", "personLastname": "VacioUno", "personSecondLastname": "Correo", "personEmail": "" }
```

**Response exacto:** los tres `201`, sin cabeceras de límite. Ninguno fue un intento.

## 6. Escenario 5 (CA-6) — Editar con el propio correo procede y cuenta igual

Usuario: **B**. Reinicia el servidor.

Objetivo: la edición no es una puerta trasera — reenviar el correo que el expediente ya tiene procede, y consume el mismo contador del sondeo.

**Endpoint:** `PUT /api/persons/<person_id de CorreoLibreB>`

Headers: `Authorization: Bearer <token de B>`, `X-Business-Unit-Id: <identificador público de B>`

```json
{
  "personFirstname": "QA",
  "personLastname": "CorreoLibreB",
  "personEmail": "qa-correo-libre-b@gsti-tests.local"
}
```

Repite la misma edición veintiuna veces.

**Response exacto:** las primeras veinte → `201`:

```json
{
  "type": "success",
  "title": "Persons",
  "message": "The person was updated successfully",
  "data": { "person": { "personId": 456, "personFirstname": "QA", "...": "..." } }
}
```

La vigésima primera → `429`, el mismo corte del Escenario 1. Nota: la edición con el propio correo responde `201` (no `422`), porque el correo del expediente no choca con otro; y como consume el mismo contador, no se puede esquivar el corte reenviando el correo propio.

## 7. Escenario 6 (CA-4) — El límite es por persona, no por empresa

Objetivo: el corte de una persona no arrastra ni a un compañero de su **misma** empresa ni a nadie de otra. Se recorren las dos mitades del criterio: **B2**, segundo capturista de la empresa B, y **A**, capturista de la empresa A.

Usuario **B** terminó cortado en el Escenario 5. **No reinicies el servidor** en este escenario (reiniciarlo borraría el corte de B y el escenario dejaría de probar nada) y no vuelvas a usar a B.

### Parte A — otra persona de la MISMA empresa

Usuario: **B2**.

**Endpoint:** `POST /api/persons`

Headers: `Authorization: Bearer *** de B2>`, `X-Business-Unit-Id: <identificador público de B>` (el mismo de B: B2 pertenece a la empresa B)

```json
{
  "personFirstname": "QA",
  "personLastname": "SondeoMismaEmpresa",
  "personSecondLastname": "Correo",
  "personEmail": "qa-sondeo-misma-empresa-<fecha-hora>@gsti-tests.local"
}
```

**Response exacto:** `201`, sin cabeceras de límite, en el mismo momento en que **B** sigue cortado y con el **mismo** `X-Business-Unit-Id`. Si el corte fuera por empresa, B2 habría recibido el `429` en su primer intento; no lo recibe porque el contador es de quien captura.

### Parte B — una persona de otra empresa

Usuario: **A** (su contador quedó limpio: el Escenario 5 reinició el servidor).

**Endpoint:** `POST /api/persons`

Headers: `Authorization: Bearer *** de A>`, `X-Business-Unit-Id: <identificador público de A>`

```json
{
  "personFirstname": "QA",
  "personLastname": "SondeoOtraPersona",
  "personSecondLastname": "Correo",
  "personEmail": "qa-sondeo-otra-<fecha-hora>@gsti-tests.local"
}
```

**Response exacto:** `201`, sin cabeceras de límite. El límite no castiga a quien no hizo nada, ni dentro ni fuera de la empresa de B.

## 8. Escenario 7 (CA-12) — El piso de escritura corta el guión automatizado

Usuario: **A**. Reinicia el servidor.

Objetivo: además del sondeo, hay un piso general de escritura de 40 por minuto por persona que corta la automatización sin tocar la lectura.

**Endpoint:** `POST /api/persons`

Headers: `Authorization: Bearer <token de A>`, `X-Business-Unit-Id: <identificador público de A>`

Cuarenta y una altas **sin** `personEmail`, en menos de un minuto:

```json
{ "personFirstname": "QA", "personLastname": "PisoEscritura", "personSecondLastname": "Correo" }
```

**Response exacto:** los primeros 40 → `201`; el 41 → `429` con el **mismo cuerpo** del corte del Escenario 1, pero el contador que cortó es el piso de escritura:

```
X-RateLimit-Limit: 40
X-RateLimit-Remaining: 0
Retry-After: 42
X-RateLimit-Reset: 2026-09-25T16:21:13.000Z
```

`X-RateLimit-Limit: 40` (no `20`) es lo que dice que cortó el piso, no el sondeo: con cero correos enviados, el contador del sondeo no pudo ser.

En ese momento, un `GET /api/persons?page=1&limit=10` como **A** responde normal (no `429`): el piso solo cubre las escrituras.

## 9. Escenario 8 (CA-7) — El registro: quién, desde qué empresa y cuándo

Objetivo: al revisar la bitácora se reconstruye quién intentó capturar correos, desde qué empresa y cuándo, y se distingue quien probó muchos correos distintos de quien capturó quince trabajadores; en ningún registro aparece un correo legible ni otro dato personal.

No hay pantalla: la bitácora se consulta en Mongo (qué base, qué colección y cómo llegar a ellas en tu cliente, en "Cómo llegar a la bitácora", arriba).

Primero, el identificador del capturista **B**:

```sql
SELECT user_id, user_email FROM users WHERE user_email = 'qa-correo-capturista-b@gsti-tests.local';
```

Filtra por él:

```js
db.log_person_email_probes.find({ actor_user_id: <user_id de B> }).sort({ date: 1 })
```

Cada intento dejó una fila con exactamente estas siete llaves:

```js
{
  path: 'store',
  email_hash: '9f2c1a4b7d8e0f3a5c6b9d2e1f4a7b8c0d3e6f9a2b5c8d1e4f7a0b3c6d9e2f5a',
  outcome: 'accepted',
  actor_user_id: 123,
  business_unit_scope: [45],
  target_person_id: null,
  date: '2026-09-25T16:20:31.123Z'
}
```

Qué significa cada dato:
- `path`: por dónde entró el intento: `store` (alta), `update` (edición) o `import` (carga masiva).
- `email_hash`: el código ciego del correo (`blindIndex`, 64 caracteres hexadecimales). Es el mismo código con el que se guarda el correo en el expediente, y **nunca el correo legible**.
- `outcome`: el desenlace: `accepted` (procedió), `rejected_not_available` (correo ya registrado) o `rate_limited` (se topó el corte).
- `actor_user_id`: quién lo intentó (la persona que capturó).
- `business_unit_scope`: desde qué empresa lo intentó.
- `target_person_id`: el expediente editado; `null` en el alta.
- `date`: cuándo, en UTC (ISO).

Comprueba que **no aparece ningún correo legible ni otro dato personal**: busca en la fila el correo que probaste y el nombre del trabajador; no están. La fila lleva identificadores internos (`actor_user_id`, `target_person_id`, la empresa) y el código ciego, no el correo ni el nombre.

Y distingue a los dos perfiles:

```js
// Quien probó muchos correos distintos: muchas filas y muchos códigos ciegos distintos.
db.log_person_email_probes.countDocuments({ actor_user_id: <user_id de B> })
db.log_person_email_probes.distinct('email_hash', { actor_user_id: <user_id de B> }).length
db.log_person_email_probes.countDocuments({ actor_user_id: <user_id de B>, outcome: 'rate_limited' })
```

```js
// Quien capturó quince trabajadores sin correo (Escenario 3, parte A): cero filas.
db.log_person_email_probes.countDocuments({ actor_user_id: <user_id de B>, date: { $gte: '<inicio del Escenario 3>', $lte: '<fin>' } })
```

El sondeo en serie deja muchas filas con desenlaces `accepted`, `rejected_not_available` y `rate_limited`, y muchos códigos ciegos distintos; las quince altas sin correo no dejan **ni una** fila. Eso es lo que separa a quien probó correos de quien solo capturó trabajadores.

## 10. Escenario 9 (CA-9) — La carga masiva deja rastro

Usuario: **B**. Objetivo: subir un archivo con correos personales deja el intento de cada fila, con quién subió el archivo y desde qué empresa.

1. Descarga la plantilla: `GET /api/employees/template-excel` (headers `Authorization` y `X-Business-Unit-Id` de B). Guárdala como `.xlsx`, **sin cambiar los encabezados, su orden ni quitar columnas**.
2. Llena **tres filas de datos**, y solo estas celdas; todo lo demás del perfil va vacío:

| Columna | Fila 1 | Fila 2 | Fila 3 |
|---|---|---|---|
| `Identificador de nómina` | `QA-CARGA-1-<fecha-hora>` | `QA-CARGA-2-<fecha-hora>` | `QA-CARGA-3-<fecha-hora>` |
| `Nombre del empleado` | `QA` | `QA` | `QA` |
| `Apellido paterno del empleado` | `CargaLibre` | `CargaOcupada` | `CargaSinCorreo` |
| `Correo personal` | `qa-carga-libre-<fecha-hora>@gsti-tests.local` | `qa-correo-ocupado@gsti-tests.local` | *(celda vacía)* |
| `ID Empleado` (columna oculta de la plantilla) | *(vacía)* | *(vacía)* | *(vacía)* |

Las reglas del archivo, para que no falle ninguna fila:

- Obligatorias en cada fila: `Identificador de nómina`, `Unidad de negocio de trabajo`, `Unidad de negocio de nómina`, `Nombre del empleado` y `Apellido paterno del empleado`.
- `Unidad de negocio de trabajo` y `Unidad de negocio de nómina` **van vacías a propósito**: una celda vacía significa "la empresa del header `X-Business-Unit-Id`". Si escribes ahí el nombre de otra empresa, esa fila se rechaza.
- `ID Empleado` es la columna oculta que ya trae la plantilla: vacía = alta; con el id de un empleado que ya existe, esa fila lo **actualiza** en vez de crear.
- `Correo personal` es la celda que prueba esta historia, y cada fila deja un rastro distinto: correo libre → el empleado se crea y la bitácora anota `accepted`; el correo ocupado → el empleado **también se crea** (la carga masiva no impone la unicidad del correo) y la bitácora anota `rejected_not_available`; celda vacía → el empleado se crea y **no deja ninguna fila** en la bitácora.
- La marca `<fecha-hora>` debe ser distinta en cada corrida, tanto en los identificadores de nómina como en el correo libre, para no chocar con lo que ya capturaste.

3. Súbela: `POST /api/employees/import-excel` (multipart/form-data; el campo se llama `file` y su valor es el archivo `.xlsx`, no su contenido pegado; headers `Authorization` y `X-Business-Unit-Id` de B).

**Response:** `200`. El `summary` sale de tu archivo; con estas tres filas da exactamente:

```json
{
  "summary": { "totalRows": 3, "processed": 3, "created": 3, "updated": 0, "failed": 0, "skipped": 0, "limitReached": false }
}
```

`totalRows` son las filas del archivo, `created` las altas y `updated` las filas que traían `ID Empleado`. La importación termina igual aunque una fila traiga un correo ya registrado: la carga masiva no impone la unicidad del correo.

El `type`, el `title` y las advertencias **no dependen de esta historia**: si el servicio de biométricos no está levantado —lo habitual en un recorrido local—, la respuesta llega como `"type": "warning"` con `"title": "Importación completada con advertencias"` y trae en `warnings` y en `errors` la línea `Error al sincronizar con biométricos: ... connect ECONNREFUSED 127.0.0.1:3334`; si está levantado, llega como `"type": "success"` con `"title": "Importación completada"` y sin advertencias. En los dos casos los empleados se crean y el rastro es el mismo: lo que se revisa aquí es el `summary` y la bitácora, no el título.

**Verificación del rastro en Mongo:**

```js
db.log_person_email_probes.find({ actor_user_id: <user_id de B>, path: 'import' }).sort({ date: 1 })
```

Debe salir **una fila por cada fila del archivo con correo no vacío**: con este archivo, dos —el correo libre como `accepted` y el ocupado como `rejected_not_available`—, y ninguna por la fila del correo vacío. Todas con `path: 'import'`, `actor_user_id` del que subió el archivo y `business_unit_scope` de su empresa. `target_person_id` es `null` en las altas y el expediente actualizado en las filas con `ID Empleado`. El correo legible no aparece en ninguna.

La carga masiva **no consume** la cuota del sondeo de quien sube el archivo: sus filas no cuentan contra las veinte por hora.

## 11. Escenario 10 (CA-11) — La consulta sigue siendo viable cuando crezca

Objetivo: consultar el registro por quién y por rango de fechas sigue siendo viable, y la consulta que hace cada intento de captura no se degrada al crecer la tabla de expedientes.

Consulta la bitácora por persona y por rango de fechas:

```js
db.log_person_email_probes.find({
  actor_user_id: <user_id de B>,
  date: { $gte: '2026-09-25T00:00:00.000Z', $lte: '2026-09-25T23:59:59.999Z' }
}).sort({ date: -1 })
```

Debe traer solo los intentos de esa persona dentro de la ventana. El filtro por persona y por rango de fechas es el mismo que usa la búsqueda de bitácoras de la plataforma (`LogStore.get`, por `date`).

Y la consulta que corre en cada intento —¿este correo ya existe?— va contra el índice `people_person_email_hash_index`:

```sql
SHOW INDEX FROM people WHERE Key_name = 'people_person_email_hash_index';
```

Debe traer una fila con `Column_name` = `person_email_hash`. Es lo que mantiene la captura viable cuando la tabla de expedientes crece.

## 12. Estados no observables con este entorno

Se declaran, sin inventarles pasos, porque no se pueden provocar con un cliente HTTP ni con el ambiente sembrado:

1. **Techo por empresa de 200 por hora** (`PERSON_EMAIL_PROBE_BUSINESS_RATE`): no se provoca a mano. Con 20 por hora por persona, harían falta diez personas de la misma empresa topando su propio contador (10 × 20 = 200) y una undécima para que el corte de empresa dispare en su primer intento. Queda cubierto por las pruebas unitarias del contador de empresa.
2. **Bitácora caída con Mongo no disponible**: que el alta o la edición sigan su curso —y el capturista no vea nada raro— cuando el registro falla no se puede provocar desde un cliente HTTP: exige tumbar Mongo. Queda cubierto por la prueba automatizada que hace fallar la escritura de la bitácora y comprueba que la respuesta es idéntica.

## 13. Checklist

- [ ] Escenario 1 — Sondeo en serie: 20 intentos (201/422) y el 21 con `429` `PERSON.IDENTITY.006`, sin mencionar el correo
- [ ] Escenario 2 — Puros aciertos: el 21 también recibe el `429`, idéntico al del Escenario 1
- [ ] Escenario 3 — Operación diaria: 15 altas sin correo y 15 con correos libres, sin fricción
- [ ] Escenario 4 — Correo vacío (`""`, ausente, `"   "`): `201`, sin intento
- [ ] Escenario 5 — Editar con el propio correo: `201` y consume el mismo contador
- [ ] Escenario 6 — El corte es por persona: B2 (misma empresa) y A (otra empresa) capturan mientras B está cortado
- [ ] Escenario 7 — Piso de escritura: la 41ª escritura responde `429` con `X-RateLimit-Limit: 40`; la lectura sigue abierta
- [ ] Escenario 8 — Bitácora: quién, empresa y cuándo; sin correo legible; distingue al sondeador del capturista
- [ ] Escenario 9 — Carga masiva: una fila de bitácora por fila del archivo con correo, con quién subió y desde qué empresa
- [ ] Escenario 10 — Consulta por persona y rango de fechas, e índice `people_person_email_hash_index`
- [ ] Estados no observables — techo de 200/h y bitácora caída, declarados sin pasos inventados
