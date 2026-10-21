# Prueba manual API — Aviso de privacidad de la evidencia fotográfica del puesto (NOM-037)

**Problema:** la NOM-037 obliga a recabar fotografías del lugar donde teletrabaja cada persona, pero esas fotografías se guardaban sin decir en ninguna parte cómo se tratan: no existía un aviso de privacidad con el que la empresa explicara para qué usa las imágenes del espacio de trabajo de su gente, y tampoco había una versión publicada que dejara constancia de lo que estaba vigente en cada momento. Cada empresa necesita un texto propio —dentro va su razón social— y un cambio de redacción no dejaba rastro de qué decía el aviso antes ni de cuánta gente lo había acusado.

**Solución:** ahora el sistema guarda una **plantilla base** del aviso, mantenida por GSTI, con el texto y sus marcadores. Cada empresa **abre un borrador** desde esa plantilla (o desde su última versión publicada), lo edita, lo **descarta** si no le sirve y lo **publica**: al publicar, los marcadores se sustituyen por el nombre legal de la empresa, el texto queda guardado como versión inmutable con su fecha, su autor y su huella, y la versión anterior deja de ser la vigente. Se puede consultar la versión vigente, el borrador en curso y el **historial de versiones** con el conteo de acuses de cada una. El aviso se administra por el API: no tiene pantalla propia en este entregable.

Ejemplo: es como el reglamento de la escuela. Hay una plantilla con el nombre del plantel en blanco; el director la copia, la ajusta a su escuela y la pega en la puerta. Cuando la cambia, pega la nueva encima y la anterior queda archivada con su fecha, para poder mostrar qué decía el día que alguien la firmó.

## Preparar

Prerrequisito de ambiente: la base de pruebas (`sae_pruebas`) al día, con las migraciones y las semillas oficiales ya corridas, porque la plantilla base del aviso es de plataforma y la siembra el producto. Sin ella, el Escenario 1 recibe `404` al pedir la plantilla (`plantilla-no-encontrada`, `TWN.NF.004`) y tampoco deja abrir el primer borrador.

Ejecutar el seeder compartido **contra la misma base del API local de pruebas**:

```bash
NODE_ENV=test DB_DATABASE=sae_pruebas node ace db:seed --files="database/seeders/_tmp_do_not_commit_qa_seeder.ts"
```

Al terminar debe aparecer en consola la línea `[qa-seeder] listo.` (sin avisos de permisos faltantes). Deja:

- **`QA Aviso Evidencia`**: la empresa del recorrido, con nombre legal **`QA Aviso Evidencia SA de CV`** — ese nombre es el que la publicación pone en el lugar del marcador — y **sin ningún aviso**: ni borrador ni versión publicada.
- Las **dos cuentas** de la tabla de usuarios, con la contraseña de prueba.

Volver a correrlo deja la empresa otra vez sin aviso: los borradores, las versiones y los acuses que hubiera escrito el recorrido se retiran.

**Datos que resuelve la base.** Cópialos aquí; no los escribas de memoria. Los números internos cambian de una base a otra. En los cuerpos y respuestas de más abajo, lo que va entre `<...>` se resuelve así: el id de la empresa y el de la cuenta salen de estas consultas, y el de la plantilla, el del aviso, la huella y las fechas salen de las respuestas mismas (cada respuesta los trae; se copian de ahí).

Empresa y su código público (el código público es el que va en el header `X-Business-Unit-Id`):

```sql
SELECT business_unit_id,
       business_unit_public_id,
       business_unit_legal_name
FROM business_units
WHERE business_unit_slug = 'qa-twn-empresa';
```

Resultado: 1 fila. El `business_unit_id` es el número interno (para las consultas de más abajo), el `business_unit_public_id` es el código que va en el header y el `business_unit_legal_name` el nombre que sustituye al marcador.

Cuenta que publica (su número interno es el que vuelve en `publishedByUserId`):

```sql
SELECT user_id
FROM users
WHERE user_email = 'qa-twn-full@gsti-tests.local';
```

Resultado: 1 fila.

**URL base:** `http://127.0.0.1:3333`

**Headers de todas las peticiones:** `Accept-Language: es` (los textos salen en español), `X-Business-Unit-Id: <código público de la empresa>` y `Authorization: Bearer <token>`. Los cuerpos JSON llevan además `Content-Type: application/json`.

### Login por producto

- **Backoffice** — `POST /api/auth/login`

Cuerpo (el correo lo indica cada escenario):

```json
{ "userEmail": "...", "userPassword": "password" }
```

El token sale en `data.token` y se envía en el header `Authorization: Bearer <token>`. Las dos cuentas de este manual entran por el backoffice.

### Usuarios

| | Correo | Contraseña | Login (producto) | Variante |
|---|---|---|---|---|
| **A** | `qa-twn-full@gsti-tests.local` | `password` | Backoffice | cuenta de la empresa con el módulo completo de Políticas de teletrabajo: consulta, abre el borrador, lo edita, lo descarta y lo publica |
| **B** | `qa-twn-lector@gsti-tests.local` | `password` | Backoffice | cuenta de la **misma empresa** que **solo consulta**: no abre borrador, ni lo edita, ni lo descarta, ni lo publica |

Todas las peticiones del recorrido llevan en `X-Business-Unit-Id` el código público de la empresa de estas cuentas (`qa-twn-empresa`).

## Escenarios

### 1. Una empresa sin aviso: no hay borrador ni versión, y la plantilla llega con su marcador

Objetivo: comprobar que una empresa que todavía no ha publicado nada responde un estado vacío —sin versión vigente y sin borrador— y que la plantilla base llega con su texto sin resolver y con la lista de marcadores permitidos.

Usuario: **A**.

Paso 1 — pide el estado:

**Endpoint:** `GET /api/nom037/telework-photo-notice`

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Aviso de privacidad de las fotos del puesto",
  "message": "Estado del aviso de privacidad obtenido correctamente.",
  "data": { "current": null, "draft": null }
}
```

Paso 2 — pide la plantilla base:

**Endpoint:** `GET /api/nom037/telework-photo-notice/template`

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Aviso de privacidad de las fotos del puesto",
  "message": "Plantilla base del aviso de privacidad obtenida correctamente.",
  "data": {
    "templateId": <id de la plantilla>,
    "version": "2026.1",
    "title": "Aviso de privacidad sobre la evidencia fotográfica del puesto de trabajo",
    "content": "<p><strong>Texto provisional: sustituir por el machote de asesoría.</strong> {{razon_social}} pone a tu disposición el presente aviso de privacidad respecto de las fotografías de tu espacio de trabajo que se recaban como evidencia de la lista de verificación de condiciones del teletrabajo, en los términos de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares.</p>",
    "placeholders": ["razon_social"]
  }
}
```

Qué significa cada dato:

- `type`: cómo salió la petición; las que funcionan traen `success` y las rechazadas `error` (cada rechazo se explica en su escenario).
- `title` / `message`: el encabezado y la frase de la respuesta correcta.
- `current`: la versión publicada que rige hoy en la empresa, o `null` si todavía no ha publicado ninguna (aquí, `null`).
- `draft`: el borrador vivo de la empresa, o `null` si no hay ninguno abierto (aquí, `null`).
- `templateId`: el número interno de la plantilla base; es el que hereda el borrador al abrirse.
- `version`: la versión de la plantilla base que mantiene GSTI; aquí `2026.1`.
- `content` (de la plantilla): el machote con sus marcadores **sin resolver**, tal como se copia al borrador.
- `placeholders`: los marcadores permitidos; puede valer `razon_social` (el nombre legal de la empresa), y ninguno más.

### 2. Abrir el borrador desde la plantilla, cambiar el párrafo y publicar la versión 1

Objetivo: comprobar que el primer borrador nace como versión 1 con la copia de la plantilla, que su párrafo se puede reescribir, y que al publicarlo queda la versión 1 vigente, con su fecha, su autor y el texto ya sin marcadores: donde estaba `{{razon_social}}` aparece el nombre legal de la empresa.

Usuario: **A**.

Paso 1 — abre el borrador (la petición no lleva cuerpo):

**Endpoint:** `POST /api/nom037/telework-photo-notice/draft`

**Response exacto:** `201`

```json
{
  "type": "success",
  "title": "Aviso de privacidad de las fotos del puesto",
  "message": "Borrador del aviso de privacidad creado correctamente.",
  "data": {
    "status": "draft",
    "teleworkPhotoNoticeId": <id del aviso>,
    "version": 1,
    "title": "Aviso de privacidad sobre la evidencia fotográfica del puesto de trabajo",
    "content": "<p><strong>Texto provisional: sustituir por el machote de asesoría.</strong> {{razon_social}} pone a tu disposición el presente aviso de privacidad respecto de las fotografías de tu espacio de trabajo que se recaban como evidencia de la lista de verificación de condiciones del teletrabajo, en los términos de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares.</p>",
    "templateId": <id de la plantilla>,
    "updatedAt": "<fecha y hora>"
  }
}
```

Paso 2 — cambia el párrafo del borrador (el marcador se deja donde está; el texto se guarda tal cual):

**Endpoint:** `PUT /api/nom037/telework-photo-notice/draft`

Cuerpo:

```json
{
  "title": "Aviso de privacidad sobre la evidencia fotográfica del puesto de trabajo",
  "content": "<p><strong>Texto provisional: sustituir por el machote de asesoría.</strong> {{razon_social}} recaba las fotografías de tu espacio de trabajo como evidencia de la lista de verificación de condiciones del teletrabajo y las trata conforme a su aviso de privacidad.</p>"
}
```

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Aviso de privacidad de las fotos del puesto",
  "message": "Borrador del aviso de privacidad actualizado correctamente.",
  "data": {
    "status": "draft",
    "teleworkPhotoNoticeId": <id del aviso>,
    "version": 1,
    "title": "Aviso de privacidad sobre la evidencia fotográfica del puesto de trabajo",
    "content": "<p><strong>Texto provisional: sustituir por el machote de asesoría.</strong> {{razon_social}} recaba las fotografías de tu espacio de trabajo como evidencia de la lista de verificación de condiciones del teletrabajo y las trata conforme a su aviso de privacidad.</p>",
    "templateId": <id de la plantilla>,
    "updatedAt": "<fecha y hora>"
  }
}
```

Paso 3 — publica el borrador (la petición no lleva cuerpo):

**Endpoint:** `POST /api/nom037/telework-photo-notice/publish`

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Aviso de privacidad de las fotos del puesto",
  "message": "Aviso de privacidad publicado correctamente.",
  "data": {
    "status": "published",
    "teleworkPhotoNoticeId": <id del aviso>,
    "version": 1,
    "title": "Aviso de privacidad sobre la evidencia fotográfica del puesto de trabajo",
    "content": "<p><strong>Texto provisional: sustituir por el machote de asesoría.</strong> QA Aviso Evidencia SA de CV recaba las fotografías de tu espacio de trabajo como evidencia de la lista de verificación de condiciones del teletrabajo y las trata conforme a su aviso de privacidad.</p>",
    "contentHash": "<huella del texto publicado>",
    "isCurrent": true,
    "publishedAt": "<fecha y hora>",
    "publishedByUserId": <id de la cuenta A>,
    "publishedByName": "Rebeca Ontiveros Salas",
    "acknowledgementsCount": 0
  }
}
```

Qué significa cada dato:

- `status`: en qué punto está esa fila del aviso; puede valer `draft` (borrador: se edita y todavía no rige) o `published` (versión publicada: ya no se edita).
- `teleworkPhotoNoticeId`: el número interno de esa fila del aviso; el borrador y la versión publicada que salió de él conservan el mismo número.
- `version`: el número de la versión del aviso. El primer borrador es la 1 y cada publicación nueva avanza; un borrador descartado consume su número y no se repite (Escenario 5).
- `title`: el encabezado del aviso, el que se edita en el borrador.
- `content`: el texto del aviso. En el borrador viaja **con** el marcador `{{razon_social}}` sin resolver (es lo que se edita); en la versión publicada ya viene sustituido por el nombre legal de la empresa y sin ningún `{{`. El nombre de la empresa se inserta **escapado**: aunque traiga algo con forma de etiqueta, se guarda y se sirve como texto, jamás como etiquetas HTML.
- `templateId`: la plantilla base de la que salió el borrador; queda como su origen aunque después se edite el texto.
- `updatedAt`: cuándo se guardó el borrador por última vez.
- `contentHash`: la huella del texto publicado, para comparar si dos versiones dicen lo mismo; se calcula con el título y el texto ya resuelto, así que cambia si cambia cualquiera de los dos.
- `isCurrent`: si esa versión es la vigente hoy; puede valer `true` (sí, es la que rige) o `false` (no, ya la sustituyó una más nueva).
- `publishedAt` / `publishedByUserId` / `publishedByName`: cuándo se publicó, quién lo hizo (su número interno) y su nombre.
- `acknowledgementsCount`: cuántas personas han acusado de recibido esa versión. Nace en 0: los acuses los escribe la aplicación del colaborador, que es otra historia.

### 3. Editar otra vez y publicar la versión 2

Objetivo: comprobar que la segunda vuelta nace como versión 2 con el texto de la versión vigente —con su marcador, listo para reescribirse— y que al publicarla la versión 2 queda vigente sin que la 1 se modifique.

Usuario: **A**.

Paso 1 — abre un borrador nuevo:

**Endpoint:** `POST /api/nom037/telework-photo-notice/draft`

**Response exacto:** `201`

```json
{
  "type": "success",
  "title": "Aviso de privacidad de las fotos del puesto",
  "message": "Borrador del aviso de privacidad creado correctamente.",
  "data": {
    "status": "draft",
    "teleworkPhotoNoticeId": <id del aviso nuevo>,
    "version": 2,
    "title": "Aviso de privacidad sobre la evidencia fotográfica del puesto de trabajo",
    "content": "<p><strong>Texto provisional: sustituir por el machote de asesoría.</strong> {{razon_social}} recaba las fotografías de tu espacio de trabajo como evidencia de la lista de verificación de condiciones del teletrabajo y las trata conforme a su aviso de privacidad.</p>",
    "templateId": <id de la plantilla>,
    "updatedAt": "<fecha y hora>"
  }
}
```

Paso 2 — edita:

**Endpoint:** `PUT /api/nom037/telework-photo-notice/draft`

Cuerpo:

```json
{
  "title": "Aviso de privacidad sobre la evidencia fotográfica del puesto de trabajo",
  "content": "<p>{{razon_social}} trata las fotografías de tu espacio de trabajo, que se recaban como evidencia de la lista de verificación de condiciones del teletrabajo, conforme a este aviso de privacidad.</p>"
}
```

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Aviso de privacidad de las fotos del puesto",
  "message": "Borrador del aviso de privacidad actualizado correctamente.",
  "data": {
    "status": "draft",
    "teleworkPhotoNoticeId": <id del aviso nuevo>,
    "version": 2,
    "title": "Aviso de privacidad sobre la evidencia fotográfica del puesto de trabajo",
    "content": "<p>{{razon_social}} trata las fotografías de tu espacio de trabajo, que se recaban como evidencia de la lista de verificación de condiciones del teletrabajo, conforme a este aviso de privacidad.</p>",
    "templateId": <id de la plantilla>,
    "updatedAt": "<fecha y hora>"
  }
}
```

Paso 3 — publica:

**Endpoint:** `POST /api/nom037/telework-photo-notice/publish`

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Aviso de privacidad de las fotos del puesto",
  "message": "Aviso de privacidad publicado correctamente.",
  "data": {
    "status": "published",
    "teleworkPhotoNoticeId": <id del aviso nuevo>,
    "version": 2,
    "title": "Aviso de privacidad sobre la evidencia fotográfica del puesto de trabajo",
    "content": "<p>QA Aviso Evidencia SA de CV trata las fotografías de tu espacio de trabajo, que se recaban como evidencia de la lista de verificación de condiciones del teletrabajo, conforme a este aviso de privacidad.</p>",
    "contentHash": "<huella del texto publicado, distinta de la de la versión 1>",
    "isCurrent": true,
    "publishedAt": "<fecha y hora>",
    "publishedByUserId": <id de la cuenta A>,
    "publishedByName": "Rebeca Ontiveros Salas",
    "acknowledgementsCount": 0
  }
}
```

Qué significa lo nuevo aquí:

- Que la versión 2 salga con `isCurrent` en `true`: la vigente es la última publicada, y la versión 1 dejó de serlo el mismo momento en que esta se publicó (su texto, su fecha y su huella no cambian: se sigue consultando en el Escenario 4).
- Que el texto del borrador llegara **con** `{{razon_social}}`: el borrador parte de lo último publicado, que guarda el texto con sus marcadores esperando a que se publiquen de nuevo.

### 4. El historial de versiones, de la más reciente a la más antigua

Objetivo: comprobar que el historial lista las versiones publicadas de la más nueva a la más vieja, cada una con su propio texto resuelto, su fecha de publicación y el conteo de acuses que tiene —en este recorrido, en cero, porque la empresa no tiene ningún acuse—, y que la versión 1 sigue consultable aunque ya no sea la vigente.

Usuario: **A**.

**Endpoint:** `GET /api/nom037/telework-photo-notice/versions`

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Aviso de privacidad de las fotos del puesto",
  "message": "Versiones del aviso de privacidad obtenidas correctamente.",
  "data": [
    {
      "status": "published",
      "teleworkPhotoNoticeId": <id de la versión 2>,
      "version": 2,
      "title": "Aviso de privacidad sobre la evidencia fotográfica del puesto de trabajo",
      "content": "<p>QA Aviso Evidencia SA de CV trata las fotografías de tu espacio de trabajo, que se recaban como evidencia de la lista de verificación de condiciones del teletrabajo, conforme a este aviso de privacidad.</p>",
      "contentHash": "<huella del texto publicado>",
      "isCurrent": true,
      "publishedAt": "<fecha y hora>",
      "publishedByUserId": <id de la cuenta A>,
      "publishedByName": "Rebeca Ontiveros Salas",
      "acknowledgementsCount": 0
    },
    {
      "status": "published",
      "teleworkPhotoNoticeId": <id de la versión 1>,
      "version": 1,
      "title": "Aviso de privacidad sobre la evidencia fotográfica del puesto de trabajo",
      "content": "<p><strong>Texto provisional: sustituir por el machote de asesoría.</strong> QA Aviso Evidencia SA de CV recaba las fotografías de tu espacio de trabajo como evidencia de la lista de verificación de condiciones del teletrabajo y las trata conforme a su aviso de privacidad.</p>",
      "contentHash": "<huella del texto publicado>",
      "isCurrent": false,
      "publishedAt": "<fecha y hora>",
      "publishedByUserId": <id de la cuenta A>,
      "publishedByName": "Rebeca Ontiveros Salas",
      "acknowledgementsCount": 0
    }
  ]
}
```

Qué significa lo nuevo aquí:

- Que `data` sea una lista: es el historial completo de la empresa, de la versión más nueva a la más vieja, y cada renglón trae los mismos datos de una versión (los ya explicados en el Escenario 2).
- `acknowledgementsCount`: el conteo es el de esa versión en concreto, no el total de la empresa. Aquí sale `0` en los dos renglones porque la empresa no tiene ningún acuse —los escribe la aplicación del colaborador, que es otra historia—; el conteo en `0` y en `1`, con un acuse sembrado en la versión anterior, se comprueba con la prueba automatizada (A.7).

### 5. Descartar el borrador y volver a abrirlo: la versión no se reutiliza

Objetivo: comprobar que un borrador que no sirve se puede descartar sin tocar la versión vigente, que sin borrador vivo las tres escrituras responden «borrador no encontrado» y que, al abrir otro, el número de versión avanza en vez de repetir el del descartado.

Usuario: **A**.

Paso 1 — abre un borrador:

**Endpoint:** `POST /api/nom037/telework-photo-notice/draft`

**Response exacto:** `201`

```json
{
  "type": "success",
  "title": "Aviso de privacidad de las fotos del puesto",
  "message": "Borrador del aviso de privacidad creado correctamente.",
  "data": {
    "status": "draft",
    "teleworkPhotoNoticeId": <id del aviso nuevo>,
    "version": 3,
    "title": "Aviso de privacidad sobre la evidencia fotográfica del puesto de trabajo",
    "content": "<p>{{razon_social}} trata las fotografías de tu espacio de trabajo, que se recaban como evidencia de la lista de verificación de condiciones del teletrabajo, conforme a este aviso de privacidad.</p>",
    "templateId": <id de la plantilla>,
    "updatedAt": "<fecha y hora>"
  }
}
```

Paso 2 — descártalo:

**Endpoint:** `DELETE /api/nom037/telework-photo-notice/draft`

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Aviso de privacidad de las fotos del puesto",
  "message": "Borrador del aviso de privacidad descartado correctamente.",
  "data": null
}
```

Paso 3 — intenta escribir sin borrador vivo: las tres responden `404` con el mismo cuerpo de «borrador no encontrado» que ve la otra empresa (A.1):

**Endpoint:** `PUT /api/nom037/telework-photo-notice/draft`

Cuerpo:

```json
{
  "title": "Aviso de privacidad sin borrador",
  "content": "<p>Sin borrador vivo.</p>"
}
```

**Endpoint:** `DELETE /api/nom037/telework-photo-notice/draft`

**Endpoint:** `POST /api/nom037/telework-photo-notice/publish`

**Response exacto (las tres):** `404`

```json
{
  "type": "error",
  "title": "Borrador no encontrado",
  "detail": "La empresa no tiene un borrador del aviso de privacidad.",
  "key": "borrador-no-encontrado",
  "code": "TWN.NF.002"
}
```

Paso 4 — pide el estado:

**Endpoint:** `GET /api/nom037/telework-photo-notice`

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Aviso de privacidad de las fotos del puesto",
  "message": "Estado del aviso de privacidad obtenido correctamente.",
  "data": {
    "current": {
      "status": "published",
      "teleworkPhotoNoticeId": <id de la versión 2>,
      "version": 2,
      "title": "Aviso de privacidad sobre la evidencia fotográfica del puesto de trabajo",
      "content": "<p>QA Aviso Evidencia SA de CV trata las fotografías de tu espacio de trabajo, que se recaban como evidencia de la lista de verificación de condiciones del teletrabajo, conforme a este aviso de privacidad.</p>",
      "contentHash": "<huella del texto publicado>",
      "isCurrent": true,
      "publishedAt": "<fecha y hora>",
      "publishedByUserId": <id de la cuenta A>,
      "publishedByName": "Rebeca Ontiveros Salas",
      "acknowledgementsCount": 0
    },
    "draft": null
  }
}
```

Paso 5 — abre otro borrador:

**Endpoint:** `POST /api/nom037/telework-photo-notice/draft`

**Response exacto:** `201`

```json
{
  "type": "success",
  "title": "Aviso de privacidad de las fotos del puesto",
  "message": "Borrador del aviso de privacidad creado correctamente.",
  "data": {
    "status": "draft",
    "teleworkPhotoNoticeId": <id del aviso nuevo>,
    "version": 4,
    "title": "Aviso de privacidad sobre la evidencia fotográfica del puesto de trabajo",
    "content": "<p>{{razon_social}} trata las fotografías de tu espacio de trabajo, que se recaban como evidencia de la lista de verificación de condiciones del teletrabajo, conforme a este aviso de privacidad.</p>",
    "templateId": <id de la plantilla>,
    "updatedAt": "<fecha y hora>"
  }
}
```

Paso 6 — mira las filas del aviso de esta empresa:

```sql
SELECT telework_photo_notice_version,
       telework_photo_notice_status,
       telework_photo_notice_is_current,
       telework_photo_notice_deleted_at
FROM telework_photo_notices
WHERE business_unit_id = <id interno de la empresa>
ORDER BY telework_photo_notice_version;
```

Resultado: 4 filas, en este orden. La 1 y la 2 con `published` (la 2, la única con `is_current` en `1`); la 3 con `draft`, `is_current` en `0` y una fecha en `deleted_at` (la descartada: **sigue en la tabla**, marcada, no se borró); y la 4 con `draft`, `is_current` en `0` y `deleted_at` en blanco.

Qué significa lo nuevo aquí:

- `data` en `null` al descartar: la respuesta no devuelve nada porque ya no queda borrador que mostrar.
- Que el borrador siguiente sea el 4 y no el 3: el número de versión no se recicla; el descartado sigue contando como versión usada.
- Que la fila descartada conserve su fecha de descarte: el descarte es una marca sobre la fila, no un borrado; el aviso publicado nunca se borra ni se edita.
- Que el estado del Paso 4 traiga `draft` en `null` y la versión 2 vigente: descartar el borrador no toca lo publicado.
- El `404` de «borrador no encontrado»: `detail` lo dice en una frase; `key` es su nombre corto (`borrador-no-encontrado`) y `code` su número estable (`TWN.NF.002`), los mismos tanto para la empresa dueña del aviso como para una ajena.

### 6. La cuenta que solo consulta: ve todo y no puede escribir

Objetivo: comprobar que una cuenta de la empresa que solo tiene el permiso de consulta ve el estado, la plantilla y el historial igual que la que publica, y que las cuatro escrituras se rechazan sin tocar nada.

Usuario: **B**. Header `X-Business-Unit-Id` = el código público de la empresa (la misma de la cuenta A).

Paso 1 — lee:

**Endpoint:** `GET /api/nom037/telework-photo-notice` → `200`

```json
{
  "type": "success",
  "title": "Aviso de privacidad de las fotos del puesto",
  "message": "Estado del aviso de privacidad obtenido correctamente.",
  "data": {
    "current": {
      "status": "published",
      "teleworkPhotoNoticeId": <id de la versión 2>,
      "version": 2,
      "title": "Aviso de privacidad sobre la evidencia fotográfica del puesto de trabajo",
      "content": "<p>QA Aviso Evidencia SA de CV trata las fotografías de tu espacio de trabajo, que se recaban como evidencia de la lista de verificación de condiciones del teletrabajo, conforme a este aviso de privacidad.</p>",
      "contentHash": "<huella del texto publicado>",
      "isCurrent": true,
      "publishedAt": "<fecha y hora>",
      "publishedByUserId": <id de la cuenta A>,
      "publishedByName": "Rebeca Ontiveros Salas",
      "acknowledgementsCount": 0
    },
    "draft": {
      "status": "draft",
      "teleworkPhotoNoticeId": <id del borrador abierto en el Escenario 5>,
      "version": 4,
      "title": "Aviso de privacidad sobre la evidencia fotográfica del puesto de trabajo",
      "content": "<p>{{razon_social}} trata las fotografías de tu espacio de trabajo, que se recaban como evidencia de la lista de verificación de condiciones del teletrabajo, conforme a este aviso de privacidad.</p>",
      "templateId": <id de la plantilla>,
      "updatedAt": "<fecha y hora>"
    }
  }
}
```

**Endpoint:** `GET /api/nom037/telework-photo-notice/template` → `200`

```json
{
  "type": "success",
  "title": "Aviso de privacidad de las fotos del puesto",
  "message": "Plantilla base del aviso de privacidad obtenida correctamente.",
  "data": {
    "templateId": <id de la plantilla>,
    "version": "2026.1",
    "title": "Aviso de privacidad sobre la evidencia fotográfica del puesto de trabajo",
    "content": "<p><strong>Texto provisional: sustituir por el machote de asesoría.</strong> {{razon_social}} pone a tu disposición el presente aviso de privacidad respecto de las fotografías de tu espacio de trabajo que se recaban como evidencia de la lista de verificación de condiciones del teletrabajo, en los términos de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares.</p>",
    "placeholders": ["razon_social"]
  }
}
```

**Endpoint:** `GET /api/nom037/telework-photo-notice/versions` → `200`

```json
{
  "type": "success",
  "title": "Aviso de privacidad de las fotos del puesto",
  "message": "Versiones del aviso de privacidad obtenidas correctamente.",
  "data": [
    {
      "status": "published",
      "teleworkPhotoNoticeId": <id de la versión 2>,
      "version": 2,
      "title": "Aviso de privacidad sobre la evidencia fotográfica del puesto de trabajo",
      "content": "<p>QA Aviso Evidencia SA de CV trata las fotografías de tu espacio de trabajo, que se recaban como evidencia de la lista de verificación de condiciones del teletrabajo, conforme a este aviso de privacidad.</p>",
      "contentHash": "<huella del texto publicado>",
      "isCurrent": true,
      "publishedAt": "<fecha y hora>",
      "publishedByUserId": <id de la cuenta A>,
      "publishedByName": "Rebeca Ontiveros Salas",
      "acknowledgementsCount": 0
    },
    {
      "status": "published",
      "teleworkPhotoNoticeId": <id de la versión 1>,
      "version": 1,
      "title": "Aviso de privacidad sobre la evidencia fotográfica del puesto de trabajo",
      "content": "<p><strong>Texto provisional: sustituir por el machote de asesoría.</strong> QA Aviso Evidencia SA de CV recaba las fotografías de tu espacio de trabajo como evidencia de la lista de verificación de condiciones del teletrabajo y las trata conforme a su aviso de privacidad.</p>",
      "contentHash": "<huella del texto publicado>",
      "isCurrent": false,
      "publishedAt": "<fecha y hora>",
      "publishedByUserId": <id de la cuenta A>,
      "publishedByName": "Rebeca Ontiveros Salas",
      "acknowledgementsCount": 0
    }
  ]
}
```

Paso 2 — intenta escribir: las cuatro responden `403` con el **mismo** cuerpo.

**Endpoint:** `POST /api/nom037/telework-photo-notice/draft` → `403`

**Endpoint:** `PUT /api/nom037/telework-photo-notice/draft` → `403`

Cuerpo de la petición:

```json
{
  "title": "Aviso de privacidad sobre la evidencia fotográfica del puesto de trabajo",
  "content": "<p>{{razon_social}} trata las fotografías de tu espacio de trabajo, que se recaban como evidencia de la lista de verificación de condiciones del teletrabajo, conforme a este aviso de privacidad.</p>"
}
```

**Endpoint:** `DELETE /api/nom037/telework-photo-notice/draft` → `403`

**Endpoint:** `POST /api/nom037/telework-photo-notice/publish` → `403`

**Response exacto (las cuatro):** `403`

```json
{
  "type": "error",
  "title": "Sin permiso",
  "message": "No tienes permiso para gestionar el aviso de privacidad de las fotos del puesto.",
  "key": "sin-permiso",
  "errorCode": "TWN.AUTH.001",
  "data": null
}
```

Paso 3 — vuelve a pedir el estado con la cuenta **A**:

**Endpoint:** `GET /api/nom037/telework-photo-notice` → `200`

```json
{
  "type": "success",
  "title": "Aviso de privacidad de las fotos del puesto",
  "message": "Estado del aviso de privacidad obtenido correctamente.",
  "data": {
    "current": {
      "status": "published",
      "teleworkPhotoNoticeId": <id de la versión 2>,
      "version": 2,
      "title": "Aviso de privacidad sobre la evidencia fotográfica del puesto de trabajo",
      "content": "<p>QA Aviso Evidencia SA de CV trata las fotografías de tu espacio de trabajo, que se recaban como evidencia de la lista de verificación de condiciones del teletrabajo, conforme a este aviso de privacidad.</p>",
      "contentHash": "<huella del texto publicado>",
      "isCurrent": true,
      "publishedAt": "<fecha y hora>",
      "publishedByUserId": <id de la cuenta A>,
      "publishedByName": "Rebeca Ontiveros Salas",
      "acknowledgementsCount": 0
    },
    "draft": {
      "status": "draft",
      "teleworkPhotoNoticeId": <id del borrador abierto en el Escenario 5>,
      "version": 4,
      "title": "Aviso de privacidad sobre la evidencia fotográfica del puesto de trabajo",
      "content": "<p>{{razon_social}} trata las fotografías de tu espacio de trabajo, que se recaban como evidencia de la lista de verificación de condiciones del teletrabajo, conforme a este aviso de privacidad.</p>",
      "templateId": <id de la plantilla>,
      "updatedAt": "<fecha y hora>"
    }
  }
}
```

Qué significa lo nuevo aquí:

- `message` / `title` del rechazo: qué permiso le falta a la cuenta, en palabras. El de las escrituras dice que no puede **gestionar** el aviso; el de las lecturas («Sin permiso de consulta») no se recorre aquí, porque ninguna de las dos cuentas de este manual deja de tener la consulta (lo cubre el Escenario A.6).
- `key`: `sin-permiso` en todos los rechazos de permisos.
- `errorCode`: el número estable del rechazo. `TWN.AUTH.001` quiere decir que a esa cuenta le falta el permiso del módulo de Políticas de teletrabajo para esa acción.
- `data`: `null`; este rechazo no trae más detalle.

### 7. Un título demasiado corto o un texto demasiado largo: la petición se rechaza antes de tocar el borrador

Objetivo: comprobar que la forma de la petición se revisa antes de guardar nada: un título de menos de 3 caracteres o un texto de más de 100 000 se rechazan con el desglose de lo que falló, y el borrador vivo queda tal cual estaba.

Usuario: **A** — el borrador vivo es el que dejó el Escenario 5 (la versión 4).

Paso 1 — edita con un título de dos caracteres:

**Endpoint:** `PUT /api/nom037/telework-photo-notice/draft`

Cuerpo:

```json
{
  "title": "ab",
  "content": "Texto válido."
}
```

**Response exacto:** `422`

```json
{
  "type": "error",
  "title": "Entrada inválida",
  "detail": "The title field must have at least 3 characters",
  "key": "entrada-invalida",
  "code": "TWN.VAL.001",
  "data": {
    "errors": [
      {
        "message": "The title field must have at least 3 characters",
        "rule": "minLength",
        "field": "title"
      }
    ]
  }
}
```

Paso 2 — edita con un texto de más de 100 000 caracteres:

El `content` va de **100 001 caracteres**, uno arriba del tope de 100 000. Lo que diga el texto no importa: pégalo repetido y verifícalo con el contador de caracteres de tu cliente de API antes de mandarlo.

**Endpoint:** `PUT /api/nom037/telework-photo-notice/draft`

Cuerpo:

```json
{
  "title": "Aviso válido",
  "content": "..."
}
```

**Response exacto:** `422`

```json
{
  "type": "error",
  "title": "Entrada inválida",
  "detail": "The content field must not be greater than 100000 characters",
  "key": "entrada-invalida",
  "code": "TWN.VAL.001",
  "data": {
    "errors": [
      {
        "message": "The content field must not be greater than 100000 characters",
        "rule": "maxLength",
        "field": "content"
      }
    ]
  }
}
```

Qué significa lo nuevo aquí:

- `data.errors`: el desglose, renglón por renglón, de lo que no cumplió la forma: `field` dice qué campo falló, `message` el motivo en una frase y `rule` qué se rompió — puede valer `minLength` (el campo quedó más corto de lo permitido) o `maxLength` (se pasó de lo permitido).
- Que las dos peticiones se rechacen **antes** de tocar el borrador: el borrador vivo sigue igual, porque lo que se revisa aquí es la forma del cuerpo, no el negocio del aviso.

## Escenarios que resuelven las pruebas automatizadas

Estos no se recorren a mano: el ambiente sembrado no puede provocarlos. Los resolvieron las pruebas automatizadas de la historia, y cada uno se marca contra su objetivo.

### A.1 El aislamiento entre empresas

Objetivo: comprobar que el aviso de una empresa no se ve ni se toca desde otra: una cuenta de otra empresa ve su propio estado vacío y, al escribir sobre lo ajeno, recibe el mismo aviso que con algo que no existe.

**Endpoint esperado y response exacto:** `GET /api/nom037/telework-photo-notice` → `200` con `{ "type": "success", "title": "Aviso de privacidad de las fotos del puesto", "message": "Estado del aviso de privacidad obtenido correctamente.", "data": { "current": null, "draft": null } }`; `GET /api/nom037/telework-photo-notice/versions` → `200` con `"data": []`; y `PUT /api/nom037/telework-photo-notice/draft`, `DELETE /api/nom037/telework-photo-notice/draft` y `POST /api/nom037/telework-photo-notice/publish` → `404` con el mismo cuerpo en los tres:

```json
{
  "type": "error",
  "title": "Borrador no encontrado",
  "detail": "La empresa no tiene un borrador del aviso de privacidad.",
  "key": "borrador-no-encontrado",
  "code": "TWN.NF.002"
}
```

Y las filas de la empresa dueña del aviso quedan intactas: su versión sigue publicada, vigente y con la misma huella.

**Qué pasó:** el recorrido no siembra una segunda empresa con su propia cuenta, así que no hay con qué provocar el corte desde el cliente; el escenario recorrible solo alcanza la empresa de las dos cuentas. Lo cubre el caso del aislamiento entre empresas, que publica de verdad en la empresa A, pide el estado y el historial con la cuenta de la empresa B —los dos vacíos—, manda las tres escrituras de B y comprueba el mismo 404 de «borrador no encontrado» y que las filas de A no se movieron.

### A.2 El marcador fuera de la lista

Objetivo: comprobar que un texto con un marcador que no existe no llega a publicarse y que el rechazo nombra los marcadores sobrantes.

**Endpoint esperado y response exacto:** `PUT /api/nom037/telework-photo-notice/draft` con `"content": "La empresa {{domicilio}} informa a {{ correo }}."` → `200` (al guardar no se revisan los marcadores: el texto se guarda tal cual); y `POST /api/nom037/telework-photo-notice/publish` → `422`:

```json
{
  "type": "error",
  "title": "Marcador no reconocido",
  "detail": "El texto usa marcadores que no existen: {{domicilio}}, {{correo}}. Permitidos: {{razon_social}}.",
  "key": "marcador-no-reconocido",
  "code": "TWN.VAL.002",
  "data": { "placeholders": ["domicilio", "correo"] }
}
```

Después del rechazo el borrador sigue en `draft`, sin huella, sin texto resuelto y sin dejar ninguna versión vigente.

**Qué pasó:** el único marcador que el producto admite es `razon_social`, y ningún paso del recorrido escribe otro; probarlo a mano obligaría a inventar un marcador que el aviso no tiene. Lo cubre el caso del marcador fuera de la lista, que edita el borrador con `{{domicilio}}` y con `{{ correo }}` —los dos fuera de la lista, el segundo con espacios internos— y comprueba ese 422 con los dos nombres, que la fila se quedó en borrador y que no quedó ninguna versión vigente.

### A.3 El contenido que queda vacío tras sanearlo

Objetivo: comprobar que un aviso al que se le limpia todo el texto no se publica.

**Endpoint esperado y response exacto:** `PUT /api/nom037/telework-photo-notice/draft` con `"content": "<script>alert(1)</script>"` → `200` con `"content": ""` (el texto peligroso se cae entero y el borrador queda en blanco); y `POST /api/nom037/telework-photo-notice/publish` → `422`:

```json
{
  "type": "error",
  "title": "Contenido vacío",
  "detail": "El aviso quedó sin texto después de limpiarlo; escríbelo antes de publicar.",
  "key": "contenido-vacio",
  "code": "TWN.VAL.003"
}
```

Sin `data`: este rechazo no trae detalle accionable. La fila se queda en `draft` y sin huella.

**Qué pasó:** para dejar el aviso sin texto hay que mandar algo que el saneado tire por completo, como una etiqueta de script; un cuerpo así no se escribe desde el recorrido, y ningún paso suyo guarda contenido que quede vacío. Lo cubre el caso del contenido vacío tras sanear, que guarda el script, comprueba que el borrador queda en blanco, que la publicación responde `422` `contenido-vacio` sin `data` y que la fila sigue siendo un borrador.

### A.4 El saneado del HTML peligroso, al guardar y al servir

Objetivo: comprobar que el marcado peligroso no llega ni al texto guardado ni al que después se sirve, ni en el borrador ni en una versión publicada.

**Endpoint esperado y response exacto:** `PUT /api/nom037/telework-photo-notice/draft` con `"content": "<p onclick=\"x()\">Hola</p><iframe src=\"//e\"></iframe>"` → `200` con `"content": "<p>Hola</p>"`, el mismo texto que devuelve `GET /api/nom037/telework-photo-notice` en el borrador; una fila alterada por fuera del API (por SQL) con un `<script>` se sirve igualmente como `<p>Hola</p>`, tanto en el borrador de `GET /api/nom037/telework-photo-notice` como en el texto de `GET /api/nom037/telework-photo-notice/versions`, sin el `<script>`.

**Qué pasó:** el recorrido siempre guarda el texto de la plantilla con su párrafo reescrito, así que nunca manda etiquetas que el aviso no admite, y nadie edita la base por fuera del API para ensuciar una fila ya servida. Lo cubren dos casos automatizados: el del saneado al guardar y al servir —que manda un párrafo con un manejador de clic y un marco incrustado, y comprueba que se guarda y se sirve solo el párrafo limpio, incluso con la fila alterada por SQL— y el del saneado de la versión servida, que altera por SQL el texto resuelto de una fila publicada y comprueba que en el estado y en el historial llega ya limpio.

### A.5 La carrera de dos borradores

Objetivo: comprobar que dos intentos de abrir el borrador al mismo tiempo dejan un solo borrador y no revientan en un error del servidor.

**Endpoint esperado y response exacto:** dos `POST /api/nom037/telework-photo-notice/draft` lanzados a la vez → uno `201` con el borrador que nace de la plantilla vigente:

```json
{
  "type": "success",
  "title": "Aviso de privacidad de las fotos del puesto",
  "message": "Borrador del aviso de privacidad creado correctamente.",
  "data": {
    "status": "draft",
    "teleworkPhotoNoticeId": <id del aviso>,
    "version": 1,
    "title": "Aviso de privacidad sobre la evidencia fotográfica del puesto de trabajo",
    "content": "<p><strong>Texto provisional: sustituir por el machote de asesoría.</strong> {{razon_social}} pone a tu disposición el presente aviso de privacidad respecto de las fotografías de tu espacio de trabajo que se recaban como evidencia de la lista de verificación de condiciones del teletrabajo, en los términos de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares.</p>",
    "templateId": <id de la plantilla>,
    "updatedAt": "<fecha y hora>"
  }
}
```

y el otro `409`:

```json
{
  "type": "error",
  "title": "Borrador ya existe",
  "detail": "Ya existe un borrador del aviso; edítalo en vez de crear otro.",
  "key": "borrador-ya-existe",
  "code": "TWN.CONF.001"
}
```

Y la empresa queda con un solo borrador (ninguna respuesta de error del servidor).

**Qué pasó:** a mano las dos peticiones salen una después de la otra, así que la segunda se rechaza por el borrador que la primera acaba de crear y no por la carrera; con la misma empresa sin aviso previo, el recorrido no puede mandar las dos en el mismo instante. Lo cubre el caso de la carrera de dos POST, que las lanza juntas desde una empresa sin borradores, comprueba que los dos estados son `201` y `409`, que el `409` trae `borrador-ya-existe` con `TWN.CONF.001`, que ninguna respuesta pasa de un error del servidor y que queda un solo borrador.

### A.6 El rechazo por falta de permiso y el atajo de gestión

Objetivo: comprobar que el reparto de permisos lo decide el servidor: con solo consulta las cuatro escrituras se rechazan, y con el permiso total del módulo —las cuatro acciones o su atajo de gestión— los siete endpoints cruzan su verificación.

**Endpoint esperado y response exacto:** con solo consulta, los tres `GET` (`/api/nom037/telework-photo-notice`, `/api/nom037/telework-photo-notice/template` y `/api/nom037/telework-photo-notice/versions`) → `200`, y las cuatro escrituras (`POST /api/nom037/telework-photo-notice/draft`, `PUT /api/nom037/telework-photo-notice/draft`, `DELETE /api/nom037/telework-photo-notice/draft` y `POST /api/nom037/telework-photo-notice/publish`) → `403` con este cuerpo, sin `detail`:

```json
{
  "type": "error",
  "title": "Sin permiso",
  "message": "No tienes permiso para gestionar el aviso de privacidad de las fotos del puesto.",
  "key": "sin-permiso",
  "errorCode": "TWN.AUTH.001",
  "data": null
}
```

Con el permiso total del módulo —el atajo de gestión, que por sí solo abre los siete endpoints— cada uno responde:

`GET /api/nom037/telework-photo-notice` → `200`

```json
{
  "type": "success",
  "title": "Aviso de privacidad de las fotos del puesto",
  "message": "Estado del aviso de privacidad obtenido correctamente.",
  "data": { "current": null, "draft": null }
}
```

`GET /api/nom037/telework-photo-notice/template` → `200`

```json
{
  "type": "success",
  "title": "Aviso de privacidad de las fotos del puesto",
  "message": "Plantilla base del aviso de privacidad obtenida correctamente.",
  "data": {
    "templateId": <id de la plantilla>,
    "version": "2026.1",
    "title": "Aviso de privacidad sobre la evidencia fotográfica del puesto de trabajo",
    "content": "<p><strong>Texto provisional: sustituir por el machote de asesoría.</strong> {{razon_social}} pone a tu disposición el presente aviso de privacidad respecto de las fotografías de tu espacio de trabajo que se recaban como evidencia de la lista de verificación de condiciones del teletrabajo, en los términos de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares.</p>",
    "placeholders": ["razon_social"]
  }
}
```

`GET /api/nom037/telework-photo-notice/versions` → `200`

```json
{
  "type": "success",
  "title": "Aviso de privacidad de las fotos del puesto",
  "message": "Versiones del aviso de privacidad obtenidas correctamente.",
  "data": []
}
```

`POST /api/nom037/telework-photo-notice/draft` → `201`

```json
{
  "type": "success",
  "title": "Aviso de privacidad de las fotos del puesto",
  "message": "Borrador del aviso de privacidad creado correctamente.",
  "data": {
    "status": "draft",
    "teleworkPhotoNoticeId": <id del aviso>,
    "version": 1,
    "title": "Aviso de privacidad sobre la evidencia fotográfica del puesto de trabajo",
    "content": "<p><strong>Texto provisional: sustituir por el machote de asesoría.</strong> {{razon_social}} pone a tu disposición el presente aviso de privacidad respecto de las fotografías de tu espacio de trabajo que se recaban como evidencia de la lista de verificación de condiciones del teletrabajo, en los términos de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares.</p>",
    "templateId": <id de la plantilla>,
    "updatedAt": "<fecha y hora>"
  }
}
```

`PUT /api/nom037/telework-photo-notice/draft` → `200`

```json
{
  "type": "success",
  "title": "Aviso de privacidad de las fotos del puesto",
  "message": "Borrador del aviso de privacidad actualizado correctamente.",
  "data": {
    "status": "draft",
    "teleworkPhotoNoticeId": <id del aviso>,
    "version": 1,
    "title": "Aviso editable",
    "content": "La empresa {{razon_social}} informa.",
    "templateId": <id de la plantilla>,
    "updatedAt": "<fecha y hora>"
  }
}
```

`POST /api/nom037/telework-photo-notice/publish` → `200`

```json
{
  "type": "success",
  "title": "Aviso de privacidad de las fotos del puesto",
  "message": "Aviso de privacidad publicado correctamente.",
  "data": {
    "status": "published",
    "teleworkPhotoNoticeId": <id del aviso>,
    "version": 1,
    "title": "Aviso editable",
    "content": "La empresa Acme &lt;b&gt;&amp; Hijos&lt;/b&gt; informa.",
    "contentHash": "<huella del texto publicado>",
    "isCurrent": true,
    "publishedAt": "<fecha y hora>",
    "publishedByUserId": <id de la cuenta que publica>,
    "publishedByName": "...",
    "acknowledgementsCount": 0
  }
}
```

`DELETE /api/nom037/telework-photo-notice/draft` → `200`

```json
{
  "type": "success",
  "title": "Aviso de privacidad de las fotos del puesto",
  "message": "Borrador del aviso de privacidad descartado correctamente.",
  "data": null
}
```

**Qué pasó:** el recorrido comprueba el rechazo de las escrituras a mano (Escenario 6); lo que el ambiente no deja armar es una cuenta con el atajo de gestión sin las acciones granulares, ni con las acciones sueltas, que es lo que fija el reparto de permisos de la historia. Lo cubren los tres casos de la prueba automatizada de permisos: con solo consulta los tres GET pasan y las cuatro escrituras responden el mismo `403` —`sin-permiso`, `TWN.AUTH.001`, `data` en `null` y sin `detail`—, con las cuatro acciones abrir, editar y descartar el borrador pasan (`201`, `200`, `200`) y publicar —ya sin borrador vivo tras el descarte— responde el `404` de «borrador no encontrado» (cruzó el permiso igual), y con solo `gestion` pasan los siete endpoints.

### A.7 El conteo de acuses por versión

Objetivo: comprobar que cada renglón del historial trae su propio conteo de acuses —la versión anterior con uno y la última con cero—, sin mezclar el de una versión con el de otra.

**Endpoint esperado y response exacto:** `GET /api/nom037/telework-photo-notice/versions` → `200`

```json
{
  "type": "success",
  "title": "Aviso de privacidad de las fotos del puesto",
  "message": "Versiones del aviso de privacidad obtenidas correctamente.",
  "data": [
    {
      "status": "published",
      "teleworkPhotoNoticeId": <id de la versión 2>,
      "version": 2,
      "title": "Aviso v2",
      "content": "La empresa Acme &lt;b&gt;&amp; Hijos&lt;/b&gt; informa de nuevo.",
      "contentHash": "<huella del texto publicado>",
      "isCurrent": true,
      "publishedAt": "<fecha y hora>",
      "publishedByUserId": <id de la cuenta que publica>,
      "publishedByName": "...",
      "acknowledgementsCount": 0
    },
    {
      "status": "published",
      "teleworkPhotoNoticeId": <id de la versión 1>,
      "version": 1,
      "title": "Aviso v1",
      "content": "La empresa Acme &lt;b&gt;&amp; Hijos&lt;/b&gt; informa.",
      "contentHash": "<huella del texto publicado>",
      "isCurrent": false,
      "publishedAt": "<fecha y hora>",
      "publishedByUserId": <id de la cuenta que publica>,
      "publishedByName": "...",
      "acknowledgementsCount": 1
    }
  ]
}
```

**Qué pasó:** el recorrido no puede dejar una versión con acuses: los escribe la aplicación del colaborador, que es otra historia, y el ambiente sembrado no trae ninguno. Lo cubre el caso del historial de versiones con conteo, que publica dos versiones, siembra un acuse en la primera y comprueba que la lista baja por versión con el conteo `0` en la última y `1` en la anterior.

### A.8 El nombre legal con marcado, escapado al publicar

Objetivo: comprobar que el nombre legal de la empresa nunca entra al aviso como marcado HTML: un nombre con forma de etiqueta se guarda y se sirve como texto, escapado.

**Endpoint esperado y response exacto:** `POST /api/nom037/telework-photo-notice/publish` → `200`

```json
{
  "type": "success",
  "title": "Aviso de privacidad de las fotos del puesto",
  "message": "Aviso de privacidad publicado correctamente.",
  "data": {
    "status": "published",
    "teleworkPhotoNoticeId": <id del aviso>,
    "version": 1,
    "title": "Aviso v1",
    "content": "La empresa Acme &lt;b&gt;&amp; Hijos&lt;/b&gt; informa.",
    "contentHash": "<huella del texto publicado>",
    "isCurrent": true,
    "publishedAt": "<fecha y hora>",
    "publishedByUserId": <id de la cuenta que publica>,
    "publishedByName": "...",
    "acknowledgementsCount": 0
  }
}
```

**Qué pasó:** el nombre legal de la empresa del recorrido (`QA Aviso Evidencia SA de CV`) no trae nada con forma de etiqueta, así que al recorrerlo no se ve el escapado; provocarlo a mano exigiría cambiarle el nombre legal a la empresa sembrada. Lo cubre el caso de la edición y publicación de la versión 1 de una empresa cuyo nombre legal trae marcado (`Acme <b>& Hijos</b>`), que comprueba que el texto publicado sale como `Acme &lt;b&gt;&amp; Hijos&lt;/b&gt;` —escapado, sin etiquetas— y que el marcador no sobrevive en el texto servido.

### A.9 La empresa sin plantilla base vigente

Objetivo: comprobar que sin una plantilla base vigente la empresa no puede ver el machote ni abrir su primer borrador, y que nada se crea por el intento.

**Endpoint esperado y response exacto:** `GET /api/nom037/telework-photo-notice/template` → `404` y `POST /api/nom037/telework-photo-notice/draft` → `404`, los dos con:

```json
{
  "type": "error",
  "title": "Plantilla no encontrada",
  "detail": "Todavía no hay una plantilla base vigente del aviso de privacidad.",
  "key": "plantilla-no-encontrada",
  "code": "TWN.NF.004"
}
```

**Qué pasó:** la plantilla base es de plataforma y la siembra el producto, así que el ambiente sembrado siempre la tiene vigente; dejarla sin vigente para recorrerlo alcanzaría a todas las empresas. Lo cubren dos pruebas: el caso funcional de la empresa sin plantilla vigente, que apaga la plantilla, comprueba esos dos `404` con la fila del aviso en cero y la restaura al terminar; y el caso unitario de la plantilla sin vigente, que comprueba el mismo `404` de la consulta del machote.

### A.10 El contrato del acuse vigente (`hasAcknowledgedCurrent`)

Objetivo: comprobar que se puede preguntar si un colaborador acusó la versión vigente de su empresa —y solo esa: ni una versión anterior, ni la de otra empresa—, porque es lo que consumirán las historias que reciben el acuse.

**Resultado esperado:** `hasAcknowledgedCurrent(empresa, colaborador)` responde `false` (falso) cuando la empresa no tiene ninguna versión publicada; `true` (verdadero) cuando ese colaborador tiene un acuse de la versión vigente y `false` para cualquier otro colaborador; `false` tras publicar una versión nueva, aunque el acuse de la anterior siga existiendo; y `false` cuando el acuse es de otra empresa. Con la empresa o el colaborador en cero o en negativo, rechaza con `aviso-no-publicado` `TWN.NF.001` sin consultar ningún dato.

**Qué pasó:** esta historia no expone esa pregunta por HTTP (el endpoint del acuse en la aplicación es de otra historia): aquí solo vive como contrato del servicio, así que no hay respuesta que armar desde un cliente de API. Lo cubren los dos casos del unitario del servicio: el que recorre la vigente y solo la vigente —sin versión publicada, con el acuse del colaborador, con el de otro colaborador, al publicar la versión nueva con el acuse anterior en pie y con el acuse de otra empresa— y el que exige empresa y colaborador válidos.

**Checklist de los escenarios automatizados** (una casilla por escenario: se marca si su prueba pasó):

- [ ] A.1 La otra empresa ve su estado y su historial vacíos y sus tres escrituras responden el mismo «borrador no encontrado», sin mover las filas de la empresa dueña
- [ ] A.2 El marcador fuera de la lista se rechaza al publicar con sus nombres sobrantes y el borrador no queda vigente
- [ ] A.3 El contenido que queda vacío al sanearlo se rechaza al publicar y la fila sigue en borrador
- [ ] A.4 El marcado peligroso se cae al guardar y al servir, tanto en el borrador como en la versión publicada alterada por SQL
- [ ] A.5 La carrera de dos borradores deja un solo borrador, con un 201 y un 409, sin error del servidor
- [ ] A.6 Con solo consulta las escrituras se rechazan, con las cuatro acciones abrir, editar y descartar pasan y con solo gestión pasan los siete endpoints
- [ ] A.7 Cada versión del historial trae su propio conteo de acuses: `0` en la última y `1` en la anterior, sin mezclarse
- [ ] A.8 El nombre legal con marcado se publica escapado, sin etiquetas y sin que el marcador sobreviva
- [ ] A.9 Sin plantilla vigente se responde el mismo «plantilla no encontrada» al ver el machote y al abrir el primer borrador, sin crear filas
- [ ] A.10 `hasAcknowledgedCurrent` responde por la versión vigente de la empresa y solo por ella, y exige empresa y colaborador válidos

## Checklist

Cada casilla se marca **contra el objetivo de su escenario**, no contra «se hicieron los pasos»:

- [ ] **Escenario 1** — una empresa sin aviso responde `current` y `draft` en `null`, y la plantilla base llega con su marcador y su lista de marcadores permitidos
- [ ] **Escenario 2** — el primer borrador queda como versión 1 con la copia de la plantilla, y al publicarlo es la vigente con su fecha, su autor y el texto ya sin marcadores (ahí aparece `QA Aviso Evidencia SA de CV`)
- [ ] **Escenario 3** — la segunda vuelta nace como versión 2 con el texto de la vigente y, al publicarla, la 2 queda vigente sin tocar la 1
- [ ] **Escenario 4** — el historial lista las versiones de la más nueva a la más vieja, cada una con su texto resuelto, su fecha y su conteo de acuses (en cero en este recorrido), y la versión 1 sigue consultable
- [ ] **Escenario 5** — descartar el borrador responde `200` con `data` en `null`, deja la versión 2 vigente, el estado sin borrador y la fila descartada marcada (no borrada); sin borrador vivo, editar, descartar y publicar responden `404` `borrador-no-encontrado` con `TWN.NF.002`; y el borrador siguiente es el 4
- [ ] **Escenario 6** — la cuenta que solo consulta ve el estado, la plantilla y el historial igual, y sus cuatro escrituras responden `403` `sin-permiso` con `TWN.AUTH.001`, sin cambios en el aviso
- [ ] **Escenario 7** — un título de 2 caracteres y un texto de 100 001 responden `422` `entrada-invalida` con `TWN.VAL.001` y el desglose de lo que falló, sin tocar el borrador vivo

## Hallazgos de otras historias

Ninguno.