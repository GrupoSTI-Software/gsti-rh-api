# Prueba manual API — Lectura pública de los documentos legales

**Problema:** el texto de los Términos y Condiciones y del Aviso de Privacidad que se ve en la página pública de la empresa era un texto escrito aparte, que podía no coincidir con la versión que las personas aceptan de verdad dentro del sistema. La única consulta que entregaba la versión vigente exigía haber iniciado sesión, así que la página pública no podía usarla.

**Solución:** ahora cualquier persona, sin cuenta ni sesión, puede consultar la versión vigente de los Términos y Condiciones y del Aviso de Privacidad, en español o en inglés. El sistema solo entrega esos dos documentos (nunca el consentimiento biométrico, borradores ni versiones anteriores), limpia el texto antes de entregarlo para que no lleve nada peligroso, siempre da la versión que esté vigente en ese momento, responde con un mensaje claro cuando se pide algo que no existe o no se puede, y frena a quien consulta más de 60 veces en un minuto.

Ejemplo: es como el reglamento pegado en la puerta de la escuela: cualquiera que pasa lo puede leer sin credencial y siempre ve la hoja más nueva que puso la dirección. Si alguien le escribió algo peligroso a la hoja, el conserje lo quita antes de pegarla; si preguntas por un papel que no se puede dar, te lo dicen claro; y si te paras a preguntar sesenta veces en un minuto, te piden que esperes un momento.

## Glosario

- **`Documento legal`**: un texto oficial de la empresa que la gente debe conocer; aquí solo importan dos: los Términos y Condiciones y el Aviso de Privacidad.
- **`Versión vigente`**: la versión del documento que hoy está en uso; de cada documento solo hay una vigente a la vez.
- **`Consentimiento biométrico`**: un tercer documento legal que existe en el sistema (sobre huellas y rostro), pero que esta consulta pública nunca entrega.
- **`Texto limpio`**: el texto del documento después de quitarle todo lo que podría hacer daño al mostrarse en una página (programas escondidos, imágenes con trampa, enlaces engañosos).

Se prueba con un cliente de API (Postman, Insomnia, Bruno). **Esta consulta no usa cuenta, ni token, ni login:** cualquiera la hace, así que no hay variantes «con permiso» y «sin permiso» y no hay que enviar ningún header de autenticación.

**URL base:** `http://127.0.0.1:3333`

**Consulta que se prueba:** `GET /api/public/legal-documents/current` con dos datos en la dirección: `type` (qué documento) y `locale` (en qué idioma).

**Aviso: los documentos legales son globales de la base.** No pertenecen a una empresa de prueba: son los mismos para todas las empresas y para todas las personas que compartan esta base de datos. Este recorrido, en el Escenario 13 y en el Escenario 14, **apaga y cambia temporalmente cuál es la versión vigente**; mientras dura ese paso, cualquiera que consulte esta base recibe otra respuesta (o un error). Cada uno de esos escenarios trae su propio paso para dejarla como estaba y, al final, la sección de Limpieza vuelve todo a su lugar.

**Aviso: el límite de 60 consultas por minuto cuenta TODAS las consultas de tu dirección.** Cuenta cada consulta que hagas durante el recorrido, incluso las de escenarios distintos. Por eso el Escenario 15 (el del límite) va **al final**: al probarlo, tu dirección queda bloqueada hasta 60 segundos y cualquier consulta que hagas en ese lapso recibirá el mismo aviso de espera.

## 1. Preparar

Antes de sembrar, **anota qué versión vigente tiene hoy cada documento** (sirve para dejar la base como estaba al terminar; el seeder no las borra, pero sí las desplaza porque solo puede haber una vigente por documento):

```sql
SELECT legal_document_type, legal_document_version
FROM legal_documents
WHERE legal_document_is_current = 1
ORDER BY legal_document_type;
```

Resultado: una fila por documento, por ejemplo `privacy_notice` / `2.0`, `terms_conditions` / `2.0` y `biometric_consent` / `1.0`. Estas son las **versiones reales**: anótalas, porque la Limpieza las compara al final. Si en cambio ves versiones que empiezan con `QA-LEGAL-`, el seeder ya se corrió antes: no hay nada que anotar y la Limpieza usa la ruta B.

Ejecutar el seeder compartido (un solo comando):

```bash
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

**No hay usuarios de prueba ni token para este manual:** la consulta es pública. Lo que deja sembrado son tres versiones de documentos legales, todas marcadas con `QA-LEGAL`:

| Documento | Versión | ¿Vigente? | Texto en español | Texto en inglés |
|---|---|---|---|---|
| Términos y Condiciones (`terms_conditions`) | `QA-LEGAL-1` | Sí | Empieza con `QA-LEGAL-TYC-ES` | Empieza con `QA-LEGAL-TYC-EN` |
| Aviso de Privacidad (`privacy_notice`) | `QA-LEGAL-1` | Sí | Empieza con `QA-LEGAL-AVISO-ES` | **Vacío** a propósito |
| Aviso de Privacidad (`privacy_notice`) | `QA-LEGAL-2` | **No** (la «futura») | Empieza con `QA-LEGAL-AVISO-FUTURA-ES` | Empieza con `QA-LEGAL-AVISO-FUTURA-EN` |

Además, los dos textos de los Términos y Condiciones (español e inglés) llevan escondidas, a propósito, cinco cosas peligrosas que el sistema debe quitar al entregarlos: un programa escondido, una imagen con trampa, un enlace que ejecuta un programa, un enlace que se sale del sitio y un párrafo que se pega sobre toda la pantalla. Se revisan en el Escenario 5.

Si en algún momento el recorrido se desordena, volver a correr el seeder deja de nuevo las tres versiones `QA-LEGAL` como arriba (vigentes las dos `QA-LEGAL-1`, y la `QA-LEGAL-2` sin vigencia).

**Cómo se lee cada respuesta.** Además del cuerpo, en varios escenarios hay que mirar las **cabeceras de la respuesta** (la pestaña *Headers* de tu cliente). Cuando el manual dice «cabecera `X`», es esa.

**Sobre `publishedAt`.** En los ejemplos aparece como `<fecha y hora de publicación>`: es la fecha y hora en que se sembró la versión, y cambia en cada base. Se ve con la forma `2026-09-30T15:40:17.000+00:00` (la zona horaria puede ser otra). Si quieres compararla, la consulta es:

```sql
SELECT legal_document_version, legal_document_published_at
FROM legal_documents
WHERE legal_document_type = 'terms_conditions'
  AND legal_document_is_current = 1;
```

## 2. Escenarios

### Escenario 1 — Términos y Condiciones en español, sin sesión

Objetivo: comprobar que una persona sin cuenta recibe los Términos y Condiciones vigentes en español, con solo los cuatro datos que le sirven a la página pública y con instrucciones para que su navegador no los comparta con nadie más.

**Endpoint:** `GET /api/public/legal-documents/current?type=terms_conditions&locale=es` (sin ningún header de autenticación)

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Documento legal",
  "message": "Documento legal vigente obtenido correctamente.",
  "data": {
    "type": "terms_conditions",
    "version": "QA-LEGAL-1",
    "content": "<p>QA-LEGAL-TYC-ES Términos y condiciones de prueba.</p><a rel=\"noopener noreferrer\">x</a><a rel=\"noopener noreferrer\">y</a><p>z</p>",
    "publishedAt": "<fecha y hora de publicación>"
  }
}
```

Verificaciones (una por una):

1. `data` trae **exactamente cuatro datos**: `type`, `version`, `content` y `publishedAt`. No aparece quién lo publicó, ningún número interno, ningún estado, ningún otro idioma ni ninguna versión anterior.
2. Cabecera `Cache-Control`: vale exactamente `private, max-age=300`.
3. Cabecera `Vary`: incluye la palabra `Origin`.

Qué significa cada dato:

- `type` (el de afuera): cómo resultó la consulta. Puede valer `success` (se entregó el documento — el que se ve en este escenario) o `error` (no se entregó; el motivo viene explicado en el mismo cuerpo — se ve desde el Escenario 6).
- `title` / `message`: el encabezado y la frase de la respuesta; salen en el idioma pedido con `locale`. En un rechazo, `title` es el nombre del problema.
- `data.type`: qué documento es. Puede valer `terms_conditions` (Términos y Condiciones — el de este escenario) o `privacy_notice` (Aviso de Privacidad — se ve en el Escenario 3). Un tercer documento, `biometric_consent` (consentimiento biométrico), existe en el sistema pero esta consulta **nunca** lo entrega (se prueba en el Escenario 6).
- `data.version`: el nombre de la versión que hoy está vigente; aquí `QA-LEGAL-1`.
- `data.content`: el texto del documento en el idioma pedido, ya limpio y listo para mostrarse. Las letras sueltas `x`, `y`, `z` y los enlaces vacíos que se ven son lo que **sobra** de las cosas peligrosas sembradas a propósito, una vez que el sistema las quitó (se explica en el Escenario 5).
- `data.publishedAt`: cuándo se publicó esa versión.
- `locale` (en la dirección): el idioma que se pide. Puede valer `es` (español) o `en` (inglés). Si no se manda o va vacío, se entrega español (Escenario 3). Cualquier otro valor se rechaza (Escenario 8).
- Cabecera `Cache-Control: private, max-age=300`: le dice al navegador de la persona que puede guardarse la respuesta **solo para ella** durante 5 minutos (300 segundos); ningún intermediario compartido puede guardarla para repartirla a otros.
- Cabecera `Vary: Origin`: avisa que la respuesta puede variar según el sitio desde el que se pregunta, para que no se mezclen respuestas de sitios distintos.

### Escenario 2 — Términos y Condiciones en inglés

Objetivo: lo mismo que el Escenario 1, pero pidiendo inglés, para comprobar que el texto del documento y los mensajes de la respuesta salen en inglés y que se conserva la misma forma de entrega.

**Endpoint:** `GET /api/public/legal-documents/current?type=terms_conditions&locale=en`

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Legal document",
  "message": "Current legal document retrieved successfully.",
  "data": {
    "type": "terms_conditions",
    "version": "QA-LEGAL-1",
    "content": "<p>QA-LEGAL-TYC-EN Test terms and conditions.</p><a rel=\"noopener noreferrer\">x</a><a rel=\"noopener noreferrer\">y</a><p>z</p>",
    "publishedAt": "<fecha y hora de publicación>"
  }
}
```

Verificaciones (una por una):

1. `data` sigue trayendo exactamente los mismos cuatro datos.
2. Cabecera `Cache-Control`: `private, max-age=300`.
3. Cabecera `Vary`: incluye `Origin`.

Qué significa lo nuevo aquí:

- `title` / `message`: ahora en inglés porque se pidió `locale=en`.
- `data.content`: ahora es el texto en inglés (empieza con `QA-LEGAL-TYC-EN`).
- (Los demás datos son los ya explicados en el Escenario 1.)

### Escenario 3 — Sin idioma o con el idioma vacío, se entrega español

Objetivo: comprobar que quien no dice en qué idioma quiere el documento —o deja el dato vacío— recibe el español, en vez de un error.

**Paso 1 — Sin mandar `locale`.**

**Endpoint:** `GET /api/public/legal-documents/current?type=privacy_notice`

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Documento legal",
  "message": "Documento legal vigente obtenido correctamente.",
  "data": {
    "type": "privacy_notice",
    "version": "QA-LEGAL-1",
    "content": "<p>QA-LEGAL-AVISO-ES Aviso de privacidad de prueba, versión vigente.</p>",
    "publishedAt": "<fecha y hora de publicación>"
  }
}
```

**Paso 2 — Mandando `locale` vacío.**

**Endpoint:** `GET /api/public/legal-documents/current?type=privacy_notice&locale=`

**Response exacto:** `200`, el mismo cuerpo del paso 1.

Qué significa lo nuevo aquí:

- `data.type` con `privacy_notice`: ahora se consulta el Aviso de Privacidad.
- Sin `locale` o con `locale` vacío, el idioma que se entrega es siempre el español (`title` y `message` en español, `content` con el texto en español).
- (Los demás datos son los ya explicados en el Escenario 1.)

### Escenario 4 — Documento sin traducción al inglés: se entrega el español

Objetivo: comprobar que cuando piden un idioma que esa versión no tiene escrito, la persona recibe el texto en español y no una respuesta vacía ni un error.

El Aviso de Privacidad sembrado (`QA-LEGAL-1`) tiene su texto en inglés **vacío** a propósito.

**Endpoint:** `GET /api/public/legal-documents/current?type=privacy_notice&locale=en`

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Legal document",
  "message": "Current legal document retrieved successfully.",
  "data": {
    "type": "privacy_notice",
    "version": "QA-LEGAL-1",
    "content": "<p>QA-LEGAL-AVISO-ES Aviso de privacidad de prueba, versión vigente.</p>",
    "publishedAt": "<fecha y hora de publicación>"
  }
}
```

Qué significa lo nuevo aquí:

- `title` / `message` salen en inglés porque se pidió inglés, pero `data.content` viene **en español** (`QA-LEGAL-AVISO-ES`): como esa versión no tiene texto en inglés, se entrega el español.
- (Los demás datos son los ya explicados en los Escenarios 1 y 3.)

### Escenario 5 — El texto sale limpio aunque lo guardado no lo esté

Objetivo: comprobar que aunque el texto guardado en la base traiga cosas peligrosas, lo que recibe cualquier persona sale limpio, y que todo enlace que sobreviva viene marcado para no dar acceso a quien lo abra.

**Paso 1 — Ver lo que está guardado (sucio a propósito).** Consulta SQL:

```sql
SELECT legal_document_content
FROM legal_documents
WHERE legal_document_type = 'terms_conditions'
  AND legal_document_version = 'QA-LEGAL-1';
```

Resultado: 1 fila. El valor es un solo texto que junta el español y el inglés; según tu cliente, las comillas dobles pueden verse precedidas de una diagonal invertida (`\"`): es solo la forma de mostrarlo, no importa. Lo que debe verse, en ambos idiomas, son estas cinco piezas sin limpiar, una tras otra: `<script>alert(1)</script>`, `<img src=x onerror=alert(1)>`, `<a href="javascript:alert(1)">x</a>`, `<a href="//evil.example">y</a>` y `<p style="position:fixed">z</p>`.

**Paso 2 — Consultar lo que se entrega.**

**Endpoint:** `GET /api/public/legal-documents/current?type=terms_conditions&locale=es` (y repetir con `locale=en`)

**Response exacto:** `200`, el mismo cuerpo del Escenario 1 (y del Escenario 2 para inglés).

Verificaciones (una por una), buscando dentro de `data.content` de **cada** una de las dos respuestas:

1. No aparece el texto `<script`.
2. No aparece el texto `alert(`.
3. No aparece el texto `<img`.
4. No aparece el texto `onerror`.
5. No aparece el texto `javascript:`.
6. No aparece el texto `//evil.example`.
7. El párrafo `z` no trae `style=` (sale simplemente como `<p>z</p>`).
8. Cada `<a` que aparece trae `rel="noopener noreferrer"` (en este texto son dos, y salen sin dirección: `<a rel="noopener noreferrer">x</a>` y `<a rel="noopener noreferrer">y</a>`).

Qué significa lo nuevo aquí:

- `data.content` limpio: el sistema no entrega nunca lo que hay guardado tal cual, sino una copia a la que se le quitó lo peligroso. Lo guardado no se corrige; se limpia cada vez que se entrega.
- `rel="noopener noreferrer"` en un enlace: la marca que impide que la página que se abre desde ese enlace pueda tomar control de la página de origen o saber de dónde vino la persona.
- (Los demás datos son los ya explicados en el Escenario 1.)

### Escenario 6 — Documento no disponible al público: mismo error, exista o no

Objetivo: comprobar que pedir el consentimiento biométrico y pedir un documento que ni existe dan exactamente la misma respuesta, para que nadie pueda descubrir desde afuera si ese documento existe.

**Paso 1 — Consentimiento biométrico.**

**Endpoint:** `GET /api/public/legal-documents/current?type=biometric_consent&locale=es`

**Response exacto:** `422`

```json
{
  "type": "error",
  "title": "Tipo de documento inválido",
  "detail": "El tipo de documento solicitado no está disponible para consulta pública.",
  "key": "tipo-de-documento-invalido",
  "code": "LGDOC.VAL.001"
}
```

**Paso 2 — Un documento que no existe.**

**Endpoint:** `GET /api/public/legal-documents/current?type=inexistente&locale=es`

**Response exacto:** `422`, **idéntico letra por letra** al del paso 1 (mismo `title`, mismo `detail`, mismo `key`, mismo `code`), y sin ningún contenido de documento.

Qué significa cada dato:

- `type` / `title`: los ya explicados en el Escenario 1; aquí `type` vale `error` porque no se entregó nada.
- `detail`: la explicación para la persona, en palabras claras. Es la misma para el consentimiento biométrico y para un documento inexistente: a propósito no dice cuál de los dos casos fue, porque decir «ese existe pero no es público» le confirmaría a un curioso que el documento existe.
- `key`: una clave fija y legible que identifica el tipo de rechazo (aquí, «tipo de documento inválido»).
- `code`: el identificador estable del rechazo; no cambia aunque cambie el idioma. En esta consulta puede valer:
  - `LGDOC.VAL.001` (el tipo de documento pedido no es válido o no se indicó — Escenarios 6 y 7),
  - `LGDOC.PUBLIC.001` (el idioma pedido no es válido — Escenario 8),
  - `LGDOC.NF.001` (el documento es válido pero todavía no tiene versión vigente — Escenario 13),
  - `LGDOC.PUBLIC.002` (se pasó del límite de consultas por minuto — Escenario 15).
- `key`, en los cuatro casos, respectivamente: `tipo-de-documento-invalido`, `idioma-de-documento-invalido`, `documento-legal-sin-version-vigente` y `demasiadas-consultas-de-documentos-legales`.

### Escenario 7 — Sin indicar qué documento se quiere

Objetivo: comprobar que una consulta que no dice qué documento quiere recibe un aviso que le explica qué opciones tiene, en lugar de un error genérico.

**Endpoint:** `GET /api/public/legal-documents/current` (sin ningún dato en la dirección)

**Response exacto:** `422`

```json
{
  "type": "error",
  "title": "Tipo de documento inválido",
  "detail": "Indica el tipo de documento: terms_conditions o privacy_notice.",
  "key": "tipo-de-documento-invalido",
  "code": "LGDOC.VAL.001"
}
```

Qué significa lo nuevo aquí:

- `detail`: aquí sí dice cuáles son los dos únicos documentos que se pueden pedir, porque la persona no pidió ninguno y no revela nada que no sea ya público.
- `code` y `key` son los mismos del Escenario 6: es el mismo tipo de rechazo, con otra explicación.
- (Los demás datos son los ya explicados en el Escenario 6.)

### Escenario 8 — Idioma que no existe

Objetivo: comprobar que pedir un idioma que el sistema no maneja se rechaza con un aviso claro de idioma, y que si además el documento también está mal pedido, el aviso que gana es el del documento.

**Paso 1 — Idioma no disponible.**

**Endpoint:** `GET /api/public/legal-documents/current?type=terms_conditions&locale=fr`

**Response exacto:** `422`

```json
{
  "type": "error",
  "title": "Idioma de documento inválido",
  "detail": "El idioma solicitado no está disponible. Usa es o en.",
  "key": "idioma-de-documento-invalido",
  "code": "LGDOC.PUBLIC.001"
}
```

**Paso 2 — Idioma y documento mal pedidos a la vez.**

**Endpoint:** `GET /api/public/legal-documents/current?type=inexistente&locale=fr`

**Response exacto:** `422`, el mismo cuerpo del Escenario 6 (el del documento no disponible, `LGDOC.VAL.001`), no el del idioma.

Qué significa lo nuevo aquí:

- `code` con `LGDOC.PUBLIC.001` y `key` con `idioma-de-documento-invalido`: el problema es el idioma pedido, no el documento.
- `detail`: le dice a la persona cuáles idiomas sí hay: `es` o `en`.
- Cuando fallan los dos datos, se avisa primero del documento (así no se da ninguna pista sobre el resto).
- (Los demás datos son los ya explicados en el Escenario 6.)

### Escenario 9 — Los errores no se guardan en el navegador

Objetivo: comprobar que las respuestas de rechazo le indican al navegador que no las guarde, para que una negativa de hoy no se le siga mostrando a la persona cuando la situación ya cambió.

**Endpoint:** `GET /api/public/legal-documents/current?type=biometric_consent&locale=es`

**Response exacto:** `422`, el mismo cuerpo del Escenario 6.

Verificación: la cabecera `Cache-Control` de esta respuesta vale exactamente `no-store`.

Los otros dos errores repiten la verificación en su propio escenario: el de «sin versión vigente» en el Escenario 13 y el de «demasiadas consultas» en el Escenario 15.

Qué significa lo nuevo aquí:

- Cabecera `Cache-Control: no-store`: le pide al navegador y a cualquier intermediario que **no guarden** esta respuesta. Es lo contrario de las respuestas correctas, que sí pueden guardarse 5 minutos (Escenario 1).
- (Los demás datos son los ya explicados en el Escenario 6.)

### Escenario 10 — El idioma del navegador no cambia lo que se entrega

Objetivo: comprobar que lo que se entrega depende solo de lo que se pidió en la dirección y no del idioma que declare el navegador de quien consulta, para que dos personas que piden lo mismo reciban exactamente lo mismo.

**Paso 1 — Con el idioma del navegador en inglés.**

**Endpoint:** `GET /api/public/legal-documents/current?type=privacy_notice&locale=es`, agregando el header `Accept-Language: en`

**Response exacto:** `200`, el mismo cuerpo del Escenario 3 (todo en español: `title` `Documento legal`, `message` `Documento legal vigente obtenido correctamente.`).

**Paso 2 — Con el idioma del navegador en español.**

**Endpoint:** la misma consulta, con el header `Accept-Language: es`

**Response exacto:** `200`, el mismo cuerpo del paso 1, **idéntico letra por letra** al del paso 1.

(Los datos son los ya explicados en los Escenarios 1 y 3.)

### Escenario 11 — Un sitio autorizado puede leer la respuesta

Objetivo: comprobar que cuando la consulta llega desde un sitio de la lista de sitios autorizados (el que usará la página pública), la respuesta le da permiso al navegador de leerla.

En el ambiente local, `http://127.0.0.1:3000` es uno de los sitios autorizados (la lista local trae también `http://localhost:3000`, `http://127.0.0.1:3001` y `http://localhost:3001`). Si en la verificación de abajo la cabecera no aparece, tu ambiente usa otra lista: pídesela a quien lo administra, usa uno de sus sitios en lugar de `http://127.0.0.1:3000` y úsalo también para comparar en el Escenario 12.

**Endpoint:** `GET /api/public/legal-documents/current?type=terms_conditions&locale=es`, agregando el header `Origin: http://127.0.0.1:3000`

**Response exacto:** `200`, el mismo cuerpo del Escenario 1.

Verificación: la respuesta trae la cabecera `Access-Control-Allow-Origin` con el valor exacto `http://127.0.0.1:3000`.

Qué significa lo nuevo aquí:

- Header de la petición `Origin`: dice desde qué sitio se está preguntando; un navegador lo manda solo, aquí lo mandas tú para simularlo.
- Cabecera `Access-Control-Allow-Origin`: es el permiso que da el sistema para que el navegador deje a ese sitio leer la respuesta. Que traiga justo el sitio que preguntó quiere decir «tú sí».
- (Los demás datos son los ya explicados en el Escenario 1.)

### Escenario 12 — Un sitio no autorizado no recibe el permiso

Objetivo: lo mismo que el Escenario 11, pero desde un sitio que no está en la lista, para comprobar que el sistema no le da permiso al navegador de leer la respuesta para ese sitio.

**Endpoint:** `GET /api/public/legal-documents/current?type=terms_conditions&locale=es`, agregando el header `Origin: http://evil.example`

**Response exacto:** `200`, el mismo cuerpo del Escenario 1 (el sistema responde igual; quien bloquea la lectura es el navegador cuando no ve el permiso).

Verificación: la respuesta **no trae** la cabecera `Access-Control-Allow-Origin` (ni con `http://evil.example` ni con ningún otro valor).

(Los datos son los ya explicados en los Escenarios 1 y 11.)

### Escenario 13 — Documento válido sin versión vigente

Objetivo: comprobar que si un documento que sí se puede pedir se queda sin versión vigente, la persona recibe un aviso claro de «todavía no hay versión publicada» y no un texto viejo ni un error confuso.

Este escenario cambia datos globales de la base. Sigue los pasos en orden, hasta el 4.

**Paso 1 — Apagar la versión vigente de los Términos y Condiciones.** Consulta SQL:

```sql
UPDATE legal_documents
SET legal_document_is_current = 0
WHERE legal_document_type = 'terms_conditions';
```

**Paso 2 — Consultar.**

**Endpoint:** `GET /api/public/legal-documents/current?type=terms_conditions&locale=es`

**Response exacto:** `404`

```json
{
  "type": "error",
  "title": "Documento legal sin versión vigente",
  "detail": "Este documento todavía no tiene una versión publicada.",
  "key": "documento-legal-sin-version-vigente",
  "code": "LGDOC.NF.001"
}
```

Verificación: la cabecera `Cache-Control` de esta respuesta vale exactamente `no-store`.

**Paso 3 — Devolver la versión vigente.** Consulta SQL:

```sql
UPDATE legal_documents
SET legal_document_is_current = 1
WHERE legal_document_type = 'terms_conditions'
  AND legal_document_version = 'QA-LEGAL-1';
```

**Paso 4 — Comprobar que volvió.** Repite la consulta del paso 2.

**Response exacto:** `200`, el mismo cuerpo del Escenario 1.

Qué significa lo nuevo aquí:

- `code` con `LGDOC.NF.001` y `key` con `documento-legal-sin-version-vigente`: el documento se puede pedir, pero hoy no hay ninguna versión en uso.
- `detail`: dice en palabras claras que todavía no hay versión publicada; a diferencia del Escenario 6, aquí no se oculta nada, porque el documento sí es público.
- (Los demás datos son los ya explicados en los Escenarios 6 y 9.)

### Escenario 14 — Una versión nueva se ve en la siguiente consulta

Objetivo: comprobar que cuando la vigente cambia, la consulta siguiente ya entrega la versión nueva, sin esperar a que caduque ninguna copia guardada por el sistema.

Usa un cliente de API que no guarde respuestas (Postman, Insomnia y Bruno no las guardan por omisión); si usas el navegador, desactiva su caché.

Este escenario cambia datos globales de la base. Sigue los pasos en orden, hasta el 5.

**Paso 1 — Consultar antes del cambio.**

**Endpoint:** `GET /api/public/legal-documents/current?type=privacy_notice&locale=es`

**Response exacto:** `200`, el mismo cuerpo del Escenario 3 (`"version": "QA-LEGAL-1"`).

**Paso 2 — Pasar la vigencia a la versión «futura».** Consulta SQL:

```sql
UPDATE legal_documents
SET legal_document_is_current =
  (legal_document_version = 'QA-LEGAL-2')
WHERE legal_document_type = 'privacy_notice'
  AND legal_document_version IN ('QA-LEGAL-1', 'QA-LEGAL-2');
```

**Paso 3 — Consultar de nuevo.**

**Endpoint:** `GET /api/public/legal-documents/current?type=privacy_notice&locale=es`

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Documento legal",
  "message": "Documento legal vigente obtenido correctamente.",
  "data": {
    "type": "privacy_notice",
    "version": "QA-LEGAL-2",
    "content": "<p>QA-LEGAL-AVISO-FUTURA-ES Aviso de privacidad de prueba, versión futura.</p>",
    "publishedAt": "<fecha y hora de publicación>"
  }
}
```

**Paso 4 — Devolver la vigencia a la versión original.** Consulta SQL:

```sql
UPDATE legal_documents
SET legal_document_is_current =
  (legal_document_version = 'QA-LEGAL-1')
WHERE legal_document_type = 'privacy_notice'
  AND legal_document_version IN ('QA-LEGAL-1', 'QA-LEGAL-2');
```

**Paso 5 — Comprobar que volvió.** Repite la consulta del paso 3.

**Response exacto:** `200`, el mismo cuerpo del Escenario 3 (`"version": "QA-LEGAL-1"`).

Qué significa lo nuevo aquí:

- `data.version` con `QA-LEGAL-2` y `data.content` con `QA-LEGAL-AVISO-FUTURA-ES`: es la versión «futura» ya en uso. El cambio se ve en la consulta inmediata siguiente.
- (Los demás datos son los ya explicados en el Escenario 1.)

### Escenario 15 — Demasiadas consultas: el sistema pide esperar (hacerlo al final)

Objetivo: comprobar que quien consulta más de 60 veces en un minuto deja de ser atendido y recibe el aviso de cuánto esperar, para que nadie pueda saturar el sistema con esta consulta pública.

**Va al final del recorrido.** El límite cuenta todas las consultas de tu dirección, incluidas las de los escenarios anteriores; al terminar este escenario tu dirección queda sin servicio hasta por 60 segundos.

**Endpoint:** `GET /api/public/legal-documents/current?type=terms_conditions&locale=es`, repetida una tras otra, rápido (con el corredor de colecciones de tu cliente), hasta ver un `429`. Bastan 61 repeticiones dentro de un mismo minuto; si en el último minuto ya habías hecho otras consultas, el `429` sale antes de la repetición 61.

**Response exacto de las primeras consultas:** `200` (el cuerpo del Escenario 1).

**Response exacto de la primera consulta que se pase del límite:** `429`

```json
{
  "type": "error",
  "title": "Demasiadas consultas de documentos legales",
  "detail": "Se alcanzó el límite de consultas. Espera unos segundos antes de volver a intentarlo.",
  "key": "demasiadas-consultas-de-documentos-legales",
  "code": "LGDOC.PUBLIC.002",
  "retryAfterSeconds": <segundos de espera, un número de 1 a 60>
}
```

Verificaciones (una por una):

1. Cabecera `Cache-Control`: vale exactamente `no-store` (explicada en el Escenario 9).
2. Cabecera `X-RateLimit-Limit`: vale `60`.
3. Cabecera `X-RateLimit-Remaining`: vale `0`.
4. Cabecera `Retry-After`: trae el mismo número que `retryAfterSeconds`.
5. Cabecera `X-RateLimit-Reset`: trae la fecha y hora en que se libera el límite, con la forma `2026-09-30T15:43:25.598Z` (hora universal, con la `Z` al final).
6. Esperar los segundos que dice `retryAfterSeconds` y repetir la consulta: responde `200` con el cuerpo del Escenario 1.

Qué significa lo nuevo aquí:

- `code` con `LGDOC.PUBLIC.002` y `key` con `demasiadas-consultas-de-documentos-legales`: el motivo del rechazo es el exceso de consultas, no el documento.
- `retryAfterSeconds`: cuántos segundos hay que esperar antes de volver a intentar.
- Cabecera `Retry-After`: lo mismo que `retryAfterSeconds`, en la forma en que la leen los navegadores y programas.
- Cabecera `X-RateLimit-Limit`: cuántas consultas se permiten por minuto (60).
- Cabecera `X-RateLimit-Remaining`: cuántas le quedan a esta dirección en este minuto (0).
- Cabecera `X-RateLimit-Reset`: a qué hora se libera el límite (fecha y hora completas, en hora universal).
- (Los demás datos son los ya explicados en el Escenario 6.)

## 3. Limpieza

Necesaria porque los Escenarios 13 y 14 cambian cuál versión es la vigente, y los documentos legales son globales de la base.

**Estado final que debe quedar:** las **versiones reales** vuelven a ser las vigentes de Términos y Condiciones y de Aviso de Privacidad, y las tres versiones `QA-LEGAL` quedan **sin vigencia** (siguen en la base, apagadas). No quedan «como al inicio» del recorrido: al inicio eran las vigentes; al terminar dejan de serlo. Para repetir el recorrido, vuelve a correr el seeder de Preparar.

**Paso 1 — Ver cuál es la versión real que va a volver.** Para cada documento es la versión publicada que no lleva la marca `QA-LEGAL` y tiene la fecha de publicación más reciente. Consulta SQL (la primera fila de cada documento es la que vuelve):

```sql
SELECT legal_document_type, legal_document_version,
  legal_document_published_at
FROM legal_documents
WHERE legal_document_version NOT LIKE 'QA-LEGAL-%'
  AND legal_document_status = 'published'
  AND legal_document_type IN ('terms_conditions', 'privacy_notice')
ORDER BY legal_document_type, legal_document_published_at DESC;
```

**Paso 2 — Devolver la vigencia.** Una sola consulta, sin nada que sustituir: para cada documento deja vigente esa versión real y apaga todas las demás (incluidas las `QA-LEGAL`). No toca el consentimiento biométrico.

```sql
UPDATE legal_documents d
JOIN (
  SELECT legal_document_type AS tipo,
    SUBSTRING_INDEX(
      GROUP_CONCAT(legal_document_id
        ORDER BY legal_document_published_at DESC,
          legal_document_id DESC),
      ',', 1) + 0 AS id_real
  FROM legal_documents
  WHERE legal_document_version NOT LIKE 'QA-LEGAL-%'
    AND legal_document_status = 'published'
    AND legal_document_type IN ('terms_conditions', 'privacy_notice')
  GROUP BY legal_document_type
) r ON r.tipo = d.legal_document_type
SET d.legal_document_is_current = (d.legal_document_id = r.id_real);
```

**Paso 3 — Comprobar el resultado.**

1. Las versiones vigentes. Consulta SQL:

   ```sql
   SELECT legal_document_type, legal_document_version
   FROM legal_documents
   WHERE legal_document_is_current = 1
   ORDER BY legal_document_type;
   ```

   - **Ruta A** (en Preparar anotaste las versiones reales): resultado, 3 filas, exactamente las que anotaste. Si alguna versión difiere de la anotada, la real que estaba vigente no era la de fecha más reciente: avisa a quien administra la base y no sigas con ese ambiente.
   - **Ruta B** (el seeder ya se había corrido antes y no anotaste nada): resultado, 3 filas: en `privacy_notice` y `terms_conditions`, la primera versión de cada documento del Paso 1, y `biometric_consent` / `1.0`.

2. Las versiones de prueba quedaron apagadas. Consulta SQL:

   ```sql
   SELECT legal_document_type, legal_document_version,
     legal_document_is_current
   FROM legal_documents
   WHERE legal_document_version LIKE 'QA-LEGAL-%'
   ORDER BY legal_document_type, legal_document_version;
   ```

   Resultado: 3 filas, las tres con `0`: `privacy_notice` / `QA-LEGAL-1`, `privacy_notice` / `QA-LEGAL-2` y `terms_conditions` / `QA-LEGAL-1`.

## 4. Lo que no se revisa aquí

- **Que el sistema no guarda ni registra tu dirección:** no se puede comprobar desde un cliente de API.
- **Que una consulta bloqueada por el límite no llega a leer la base de datos:** no es observable desde afuera; el Escenario 15 solo demuestra el aviso y las cabeceras.
- **Los intermediarios compartidos (por ejemplo un servicio que reparte contenido a mucha gente):** este ambiente local no tiene ninguno; solo se revisa que la respuesta le prohíba guardarla para otros (Escenario 1).
- **La cookie de sesión que el sistema puede entregar en las respuestas:** no forma parte de lo que se prueba aquí; ignórala.
- **El sitio público que mostrará estos textos:** es otra historia; aquí solo se prueba la consulta.

## 5. Checklist

- [ ] Escenario 1: una persona sin cuenta recibe los Términos y Condiciones en español con solo cuatro datos y con la instrucción de guardarse solo en su navegador (`200`, `Cache-Control: private, max-age=300`, `Vary` con `Origin`)
- [ ] Escenario 2: pidiendo inglés, el texto y los mensajes salen en inglés con la misma forma de entrega
- [ ] Escenario 3: quien no dice el idioma, o lo deja vacío, recibe español y no un error
- [ ] Escenario 4: si la versión no tiene el idioma pedido (Aviso en inglés), se entrega el español
- [ ] Escenario 5: lo guardado está sucio y lo entregado sale limpio, con todo enlace marcado con `rel="noopener noreferrer"`
- [ ] Escenario 6: el consentimiento biométrico y un documento inexistente dan el mismo `422` (`LGDOC.VAL.001`) con cuerpo idéntico, sin revelar si existe
- [ ] Escenario 7: una consulta sin `type` recibe un `422` que le dice qué documentos puede pedir
- [ ] Escenario 8: un idioma inexistente recibe `422` de idioma (`LGDOC.PUBLIC.001`), y con documento e idioma mal pedidos gana el aviso del documento
- [ ] Escenario 9: el rechazo trae `Cache-Control: no-store` para que el navegador no lo guarde
- [ ] Escenario 10: el idioma declarado por el navegador (`Accept-Language`) no cambia lo entregado
- [ ] Escenario 11: un sitio autorizado recibe el permiso de lectura (`Access-Control-Allow-Origin` con su sitio)
- [ ] Escenario 12: un sitio no autorizado no recibe ese permiso
- [ ] Escenario 13: sin versión vigente se recibe `404` (`LGDOC.NF.001`) con `no-store`, y la vigencia quedó restaurada
- [ ] Escenario 14: al cambiar la vigente, la consulta siguiente ya trae la versión nueva, y la vigencia quedó restaurada
- [ ] Escenario 15: pasado el límite de 60 por minuto se recibe `429` (`LGDOC.PUBLIC.002`) con `retryAfterSeconds`, `no-store` y las cabeceras de espera, y tras esperar se vuelve a ser atendido
- [ ] Limpieza: las versiones reales volvieron a ser las vigentes y las tres versiones `QA-LEGAL` quedaron sin vigencia
