# Prueba manual API — Estado de aceptación de Términos y Aviso por empresa

**Problema:** cuando se publica una versión nueva de los Términos y condiciones o del Aviso de privacidad, el equipo que administra el sistema no tenía cómo saber qué empresas clientes ya la aceptaron, cuáles siguen con la versión anterior y cuáles nunca aceptaron nada. Había que preguntarlo una por una.

**Solución:** la consola de plataforma ahora tiene un listado de solo lectura con **todas las empresas** y, por cada una, el estado de los dos documentos: `al-dia` (la cuenta propietaria aceptó la versión vigente), `pendiente` (aceptó una versión anterior, pero no la vigente) o `nunca` (jamás aceptó ese documento). Se puede filtrar por estado, buscar por nombre o por RFC completo (el RFC nunca se devuelve en la respuesta) y paginar. Solo lo ve quien entra con la **sesión de la consola de plataforma**: ni la cuenta propietaria de una empresa, ni siquiera un administrador de plataforma que entre por el backoffice, pueden leerlo.

Ejemplo: es como la lista de la escuela donde la maestra anota quién ya firmó el reglamento nuevo: unos firmaron el de este año, otros solo el del año pasado y otros nunca han firmado ninguno; y solo la directora puede ver esa lista, no los papás.

## Glosario

- **`Empresa`**: cada cliente dado de alta en el sistema; tiene su propia cuenta propietaria y sus propios usuarios.
- **`Cuenta propietaria`**: el usuario que es dueño de la empresa; solo lo que acepta esa cuenta cuenta como «la empresa aceptó».
- **`Versión vigente`**: la versión de un documento (Términos o Aviso) que hoy rige; solo hay una por documento.
- **`Pendiente de volver a aceptar`**: la empresa aceptó una versión anterior del documento, pero todavía no la vigente.
- **`Consola de plataforma`**: el panel exclusivo de quienes administran el sistema; se entra con su propio inicio de sesión.
- **`Backoffice`**: el panel que usan las empresas clientes; se entra con otro inicio de sesión.

Se prueba con un cliente de API (Postman, Insomnia, Bruno).

**URL base:** `http://127.0.0.1:3333`

**Sin `X-Business-Unit-Id`, a propósito.** Los manuales del backoffice exigen el header `X-Business-Unit-Id`. Este endpoint es de plataforma y **no lo lleva**: no lo envíes en ninguna petición de este manual.

**Con qué token se prueba.** Aquí el origen del token es la esencia del acceso, así que sí se documenta (se envía en el header `Authorization: Bearer <token>`):

- **Token de la consola de plataforma** — `POST /api/platform/auth/login` con

  ```json
  { "userEmail": "qa-aceptacion-plataforma@gsti-tests.local", "userPassword": "password" }
  ```

  El token sale en `data.token` de la respuesta. Es el único que abre el listado (Escenarios 1 a 4 y 8).
- **Token del backoffice** — `POST /api/auth/login` con el mismo cuerpo pero el correo que indica cada escenario (Escenarios 6 y 7). Es el que usan las empresas clientes.

**Interruptor global — léelo antes del Escenario 1.** Los documentos vigentes son de **toda la plataforma**, no de una empresa. El seeder deja como únicas versiones vigentes de Términos y de Aviso las de este manual (`QA-ACEP-T2.0` y `QA-ACEP-P1.0`) y **apaga las que dejaron otras historias** (por ejemplo las `QA-LEGAL-1` de la lectura pública). Mientras dure el recorrido, quien comparta esa base verá aquellas versiones como no vigentes (y, en el backoffice, el aviso de volver a aceptar). Al terminar, el paso **Limpieza** lo deja como estaba.

## 1. Preparar

Ejecutar el seeder compartido:

```bash
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Volver a correrlo deja todo otra vez como al inicio (las aceptaciones se rehacen con sus fechas fijas).

Deja tres empresas —**`QA Aceptacion Al Dia`**, **`QA Aceptacion Pendiente`** y **`QA Aceptacion Nunca`**—, los tres documentos de abajo y cinco usuarios.

| | Correo | Contraseña | Variante |
|---|---|---|---|
| **A** | `qa-aceptacion-plataforma@gsti-tests.local` | `password` | Administrador de plataforma que entra por la **consola**: el único que puede leer el listado |
| **B** | `qa-aceptacion-owner-bo@gsti-tests.local` | `password` | Cuenta propietaria de `QA Aceptacion Pendiente`; entra por el **backoffice** |
| **C** | `qa-aceptacion-plataforma-bo@gsti-tests.local` | `password` | Administrador de plataforma que entra por el **backoffice** (no por la consola) |
| — | `qa-aceptacion-owner-aldia@gsti-tests.local`, `qa-aceptacion-owner-nunca@gsti-tests.local` | `password` | Cuentas propietarias de las otras dos empresas; sostienen sus estados y no se usan para iniciar sesión en este manual |

Documentos que deja el seeder (las horas son de la Ciudad de México; en las respuestas salen en UTC, ver el Escenario 1):

| Documento | Versión | ¿Vigente? | Publicado |
|---|---|---|---|
| Términos y condiciones | `QA-ACEP-T1.0` | No (ya la reemplazó la v2.0) | 2026-01-15 10:00 |
| Términos y condiciones | `QA-ACEP-T2.0` | **Sí** | 2026-09-01 12:00 |
| Aviso de privacidad | `QA-ACEP-P1.0` | **Sí** | 2026-02-01 10:00 |

Qué aceptó la cuenta propietaria de cada empresa:

| Empresa | Términos | Aviso |
|---|---|---|
| `QA Aceptacion Al Dia` | `QA-ACEP-T2.0`, el 2026-09-02 09:30 | `QA-ACEP-P1.0`, el 2026-09-05 10:00 |
| `QA Aceptacion Pendiente` | `QA-ACEP-T1.0`, el 2026-03-10 09:15 (la vigente es la v2.0) | nada |
| `QA Aceptacion Nunca` | nada | nada |

`QA Aceptacion Al Dia` tiene además un perfil fiscal con el RFC `XAXX010101000` (para el Escenario 3).

**La base trae empresas de otras historias.** El listado sin filtro de búsqueda también trae a todas las empresas de pruebas de otras historias (decenas), cuyo estado no depende de este manual. La seña para reconocer las propias es el prefijo **`QA Aceptacion`**: por eso los escenarios 1 a 4 lo usan en `search`, y los totales que se escriben aquí son los de ese filtro.

Identificadores públicos de las tres empresas, solo para reconocer cada fila en las respuestas (se escriben `<id público de QA Aceptacion Al Dia>`, etc.):

```sql
SELECT business_unit_name, business_unit_public_id
FROM business_units
WHERE business_unit_name LIKE 'QA Aceptacion%'
ORDER BY business_unit_name;
```

Resultado: 3 filas (`QA Aceptacion Al Dia`, `QA Aceptacion Nunca`, `QA Aceptacion Pendiente`).

El endpoint solo lee: no crea ni cambia nada, así que ningún escenario tiene consecuencias que verificar en la base (la única excepción es el paso de Limpieza).

## 2. Escenarios

### Escenario 1 — Lista con las tres empresas, cada una en su estado

Objetivo: comprobar que la consola ve a cada empresa con el estado real de sus dos documentos —una al día, una con versión nueva por aceptar y una que nunca aceptó— junto con las versiones vigentes y el conteo.

Usuario: **A** (token de la consola).

**Endpoint:** `GET /api/platform/legal-acceptances?search=QA Aceptacion`

Headers: `Authorization: Bearer <token de A>` (sin `X-Business-Unit-Id`)

**Response exacto:** `200`

```json
{
  "type": "success",
  "currentVersions": {
    "termsConditions": {
      "version": "QA-ACEP-T2.0",
      "publishedAt": "2026-09-01T18:00:00.000+00:00"
    },
    "privacyNotice": {
      "version": "QA-ACEP-P1.0",
      "publishedAt": "2026-02-01T16:00:00.000+00:00"
    }
  },
  "data": [
    {
      "businessUnitPublicId": "<id público de QA Aceptacion Al Dia>",
      "businessUnitName": "QA Aceptacion Al Dia",
      "termsConditions": {
        "status": "al-dia",
        "lastAcceptedAt": "2026-09-02T15:30:00.000+00:00"
      },
      "privacyNotice": {
        "status": "al-dia",
        "lastAcceptedAt": "2026-09-05T16:00:00.000+00:00"
      }
    },
    {
      "businessUnitPublicId": "<id público de QA Aceptacion Nunca>",
      "businessUnitName": "QA Aceptacion Nunca",
      "termsConditions": {
        "status": "nunca",
        "lastAcceptedAt": null
      },
      "privacyNotice": {
        "status": "nunca",
        "lastAcceptedAt": null
      }
    },
    {
      "businessUnitPublicId": "<id público de QA Aceptacion Pendiente>",
      "businessUnitName": "QA Aceptacion Pendiente",
      "termsConditions": {
        "status": "pendiente",
        "lastAcceptedAt": "2026-03-10T15:15:00.000+00:00"
      },
      "privacyNotice": {
        "status": "nunca",
        "lastAcceptedAt": null
      }
    }
  ],
  "meta": {
    "total": 3,
    "page": 1,
    "limit": 20,
    "lastPage": 1
  }
}
```

Las filas vienen ordenadas por nombre de empresa. Cada `businessUnitPublicId` es el que devuelve la consulta de Preparar para esa empresa. Cada fila trae exactamente esas cuatro llaves: ningún dato fiscal ni identificador interno.

Las horas salen en UTC (`+00:00`): `2026-09-01T18:00:00.000+00:00` es el 2026-09-01 12:00 de la Ciudad de México. Si tu servidor corre en otra zona horaria, el desfase de las horas cambia (por ejemplo `-06:00`) pero el instante es el mismo.

Qué significa cada dato:

- `type`: cómo resultó la consulta. En este listado solo puede valer `success` (la consulta se hizo); los avisos de error de los Escenarios 5 a 8 traen otro formato, que se explica ahí.
- `currentVersions`: la versión que hoy rige de cada documento. `termsConditions` son los Términos y condiciones; `privacyNotice`, el Aviso de privacidad. Puede valer un objeto con los datos de la versión (aquí, siempre) o `null` (el documento no tiene ninguna versión vigente publicada; no se puede provocar en este ambiente).
- `currentVersions.….version`: el nombre de la versión vigente.
- `currentVersions.….publishedAt`: el día y la hora en que se publicó esa versión.
- `data`: una fila por empresa.
- `businessUnitPublicId`: el identificador público de la empresa, el mismo que se ve en la consola.
- `businessUnitName`: el nombre de la empresa.
- `termsConditions` / `privacyNotice` (dentro de cada fila): cómo va esa empresa con ese documento.
- `status`: puede valer `al-dia` (la cuenta propietaria aceptó la versión vigente), `pendiente` (aceptó una versión anterior, pero no la vigente), `nunca` (nunca aceptó ese documento) o `sin-version-publicada` (el documento no tiene versión vigente, así que no hay nada que aceptar; no se puede provocar en este ambiente).
- `lastAcceptedAt`: el día y la hora de la última vez que la cuenta propietaria aceptó cualquier versión de ese documento; `null` quiere decir que nunca. Con `al-dia` es la fecha de la versión vigente; con `pendiente`, la de la versión anterior.
- `meta.total`: cuántas empresas cumplen el filtro en total (no solo las de esta página).
- `meta.page`: la página que se está viendo.
- `meta.limit`: cuántas empresas caben por página; si no se pide otro, son 20.
- `meta.lastPage`: cuántas páginas hay en total con ese filtro y ese tamaño de página.

### Escenario 2 — El filtro por estado deja solo las empresas de ese estado

Objetivo: comprobar que filtrar por estado muestra únicamente a las empresas que están en él —`pendiente` solo a la que tiene una versión nueva por aceptar, `al-dia` solo a la que lo tiene todo aceptado— y que las demás, incluida la que nunca aceptó, desaparecen de la lista.

Usuario: **A** (token de la consola).

**Paso 1 — Solo las pendientes.**

**Endpoint:** `GET /api/platform/legal-acceptances?search=QA Aceptacion&status=pendiente`

**Response exacto:** `200`

```json
{
  "type": "success",
  "currentVersions": {
    "termsConditions": {
      "version": "QA-ACEP-T2.0",
      "publishedAt": "2026-09-01T18:00:00.000+00:00"
    },
    "privacyNotice": {
      "version": "QA-ACEP-P1.0",
      "publishedAt": "2026-02-01T16:00:00.000+00:00"
    }
  },
  "data": [
    {
      "businessUnitPublicId": "<id público de QA Aceptacion Pendiente>",
      "businessUnitName": "QA Aceptacion Pendiente",
      "termsConditions": {
        "status": "pendiente",
        "lastAcceptedAt": "2026-03-10T15:15:00.000+00:00"
      },
      "privacyNotice": {
        "status": "nunca",
        "lastAcceptedAt": null
      }
    }
  ],
  "meta": {
    "total": 1,
    "page": 1,
    "limit": 20,
    "lastPage": 1
  }
}
```

**Paso 2 — Solo las al día.**

**Endpoint:** `GET /api/platform/legal-acceptances?search=QA Aceptacion&status=al-dia`

**Response exacto:** `200`

```json
{
  "type": "success",
  "currentVersions": {
    "termsConditions": {
      "version": "QA-ACEP-T2.0",
      "publishedAt": "2026-09-01T18:00:00.000+00:00"
    },
    "privacyNotice": {
      "version": "QA-ACEP-P1.0",
      "publishedAt": "2026-02-01T16:00:00.000+00:00"
    }
  },
  "data": [
    {
      "businessUnitPublicId": "<id público de QA Aceptacion Al Dia>",
      "businessUnitName": "QA Aceptacion Al Dia",
      "termsConditions": {
        "status": "al-dia",
        "lastAcceptedAt": "2026-09-02T15:30:00.000+00:00"
      },
      "privacyNotice": {
        "status": "al-dia",
        "lastAcceptedAt": "2026-09-05T16:00:00.000+00:00"
      }
    }
  ],
  "meta": {
    "total": 1,
    "page": 1,
    "limit": 20,
    "lastPage": 1
  }
}
```

Qué significa lo nuevo aquí:

- `status` como filtro (en la URL): puede valer `al-dia`, `pendiente` o `nunca`, con el mismo sentido que en el Escenario 1. Se mira documento por documento: con `pendiente` sale una empresa si **alguno** de sus dos documentos está pendiente. `sin-version-publicada` no se acepta como filtro.
- (Los demás datos son los ya explicados en el Escenario 1; `meta.total` ahora cuenta solo las empresas que pasan el filtro.)

### Escenario 3 — Buscar por nombre, por RFC completo y algo que no existe

Objetivo: comprobar que una empresa se puede encontrar por su nombre o por su RFC completo sin que la respuesta revele nunca el RFC, y que buscar algo que no existe da una lista vacía y no un error.

Usuario: **A** (token de la consola).

**Paso 1 — Por nombre.**

**Endpoint:** `GET /api/platform/legal-acceptances?search=QA Aceptacion Pendiente`

**Response exacto:** `200` — el mismo cuerpo del Paso 1 del Escenario 2 (una sola fila, `QA Aceptacion Pendiente`, y `meta` con `total` `1`).

**Paso 2 — Por RFC completo.**

**Endpoint:** `GET /api/platform/legal-acceptances?search=XAXX010101000`

**Response exacto:** `200` — el mismo cuerpo del Paso 2 del Escenario 2 (una sola fila, `QA Aceptacion Al Dia`, la empresa que tiene ese RFC, y `meta` con `total` `1`).

Confirmación: busca el texto `XAXX010101000` dentro de la respuesta completa. Resultado: 0 coincidencias (el RFC sirvió para encontrar la empresa, pero no viaja en la respuesta).

**Paso 3 — Algo que no existe.**

**Endpoint:** `GET /api/platform/legal-acceptances?search=QA Aceptacion Inexistente`

**Response exacto:** `200`

```json
{
  "type": "success",
  "currentVersions": {
    "termsConditions": {
      "version": "QA-ACEP-T2.0",
      "publishedAt": "2026-09-01T18:00:00.000+00:00"
    },
    "privacyNotice": {
      "version": "QA-ACEP-P1.0",
      "publishedAt": "2026-02-01T16:00:00.000+00:00"
    }
  },
  "data": [],
  "meta": {
    "total": 0,
    "page": 1,
    "limit": 20,
    "lastPage": 1
  }
}
```

Qué significa lo nuevo aquí:

- `search` (en la URL): el texto a buscar. Encuentra empresas por su nombre, por el nombre legal con el que están registradas o por un RFC completo y válido; un RFC a medias no encuentra nada.
- `data` vacío (`[]`) con `total` `0`: no hay ninguna empresa que coincida; no es un error, y `lastPage` sigue valiendo `1`.
- (Los demás datos son los ya explicados en los Escenarios 1 y 2.)

### Escenario 4 — La lista se reparte en páginas

Objetivo: comprobar que al pedir páginas de una sola empresa el listado las reparte de una en una, en orden por nombre, y que el total y el número de páginas cuadran con las tres empresas sembradas.

Usuario: **A** (token de la consola).

**Paso 1 — Primera página.**

**Endpoint:** `GET /api/platform/legal-acceptances?search=QA Aceptacion&limit=1`

**Response exacto:** `200`

```json
{
  "type": "success",
  "currentVersions": {
    "termsConditions": {
      "version": "QA-ACEP-T2.0",
      "publishedAt": "2026-09-01T18:00:00.000+00:00"
    },
    "privacyNotice": {
      "version": "QA-ACEP-P1.0",
      "publishedAt": "2026-02-01T16:00:00.000+00:00"
    }
  },
  "data": [
    {
      "businessUnitPublicId": "<id público de QA Aceptacion Al Dia>",
      "businessUnitName": "QA Aceptacion Al Dia",
      "termsConditions": {
        "status": "al-dia",
        "lastAcceptedAt": "2026-09-02T15:30:00.000+00:00"
      },
      "privacyNotice": {
        "status": "al-dia",
        "lastAcceptedAt": "2026-09-05T16:00:00.000+00:00"
      }
    }
  ],
  "meta": {
    "total": 3,
    "page": 1,
    "limit": 1,
    "lastPage": 3
  }
}
```

**Paso 2 — Última página.**

**Endpoint:** `GET /api/platform/legal-acceptances?search=QA Aceptacion&limit=1&page=3`

**Response exacto:** `200`

```json
{
  "type": "success",
  "currentVersions": {
    "termsConditions": {
      "version": "QA-ACEP-T2.0",
      "publishedAt": "2026-09-01T18:00:00.000+00:00"
    },
    "privacyNotice": {
      "version": "QA-ACEP-P1.0",
      "publishedAt": "2026-02-01T16:00:00.000+00:00"
    }
  },
  "data": [
    {
      "businessUnitPublicId": "<id público de QA Aceptacion Pendiente>",
      "businessUnitName": "QA Aceptacion Pendiente",
      "termsConditions": {
        "status": "pendiente",
        "lastAcceptedAt": "2026-03-10T15:15:00.000+00:00"
      },
      "privacyNotice": {
        "status": "nunca",
        "lastAcceptedAt": null
      }
    }
  ],
  "meta": {
    "total": 3,
    "page": 3,
    "limit": 1,
    "lastPage": 3
  }
}
```

Qué significa lo nuevo aquí:

- `limit` y `page` (en la URL): cuántas empresas por página (de 1 a 100) y cuál página ver (desde la 1). Con tres empresas y una por página, `lastPage` vale `3`; la página 2 sería `QA Aceptacion Nunca`.
- (Los demás datos son los ya explicados en el Escenario 1.)

### Escenario 5 — Sin token

Objetivo: comprobar que quien llega sin sesión recibe solo el aviso de «token requerido» que el sistema da a cualquier sección protegida, sin ningún dato de ninguna empresa.

Usuario: ninguno.

**Endpoint:** `GET /api/platform/legal-acceptances?search=QA Aceptacion`

Headers: ninguno (sin `Authorization`).

**Response exacto:** `401`

```json
{
  "type": "warning",
  "title": "Token requerido",
  "detail": "No se envió un access token válido",
  "message": "No se envió un access token válido",
  "key": "AUTH.TOKEN.MISSING",
  "data": {
    "refreshable": false
  }
}
```

Qué significa cada dato:

- `type`: la gravedad del aviso. Aquí vale `warning` (el problema es de quien pide, no del servidor); los demás avisos de este manual traen otro formato.
- `title` / `detail` / `message`: el encabezado y la frase que explican el motivo: no se mandó una sesión válida.
- `key`: clave fija del motivo; `AUTH.TOKEN.MISSING` quiere decir que falta el token.
- `data.refreshable`: si la sesión se podría renovar; `false` porque ni siquiera hay sesión.

### Escenario 6 — La cuenta propietaria de una empresa, con su sesión del backoffice

Objetivo: comprobar que el dueño de una empresa, aun con una sesión válida del backoffice, no entra a esta sección de plataforma y no ve nada de ninguna empresa.

Usuario: **B** (token del backoffice).

Antes, obtén el token: `POST /api/auth/login` con

```json
{ "userEmail": "qa-aceptacion-owner-bo@gsti-tests.local", "userPassword": "password" }
```

El token sale en `data.token`.

**Endpoint:** `GET /api/platform/legal-acceptances?search=QA Aceptacion`

Headers: `Authorization: Bearer <token de B>` (sin `X-Business-Unit-Id`)

**Response exacto:** `403`

```json
{
  "title": "Acceso restringido a plataforma",
  "detail": "Esta sección es exclusiva de administradores de plataforma.",
  "key": "AUTH.PLATFORM.FORBIDDEN"
}
```

Qué significa cada dato:

- `title` / `detail`: el encabezado y la frase del rechazo: la sección es solo para quienes administran la plataforma.
- `key`: clave fija del motivo; `AUTH.PLATFORM.FORBIDDEN` quiere decir que la sesión no es de la consola de plataforma.
- Este aviso no trae `type` ni `code`, y no trae nombres ni datos de ninguna empresa.

### Escenario 7 — Un administrador de plataforma que entra por el backoffice

Objetivo: lo mismo que el Escenario 6, pero con una cuenta que **sí** es administradora de plataforma, para comprobar que lo que abre la sección es la sesión de la consola y no solo que la cuenta sea de administrador.

Usuario: **C** (token del backoffice).

Antes, obtén el token: `POST /api/auth/login` con

```json
{ "userEmail": "qa-aceptacion-plataforma-bo@gsti-tests.local", "userPassword": "password" }
```

El token sale en `data.token`.

**Endpoint:** `GET /api/platform/legal-acceptances?search=QA Aceptacion`

Headers: `Authorization: Bearer <token de C>` (sin `X-Business-Unit-Id`)

**Response exacto:** `403`

```json
{
  "title": "Acceso restringido a plataforma",
  "detail": "Esta sección es exclusiva de administradores de plataforma.",
  "key": "AUTH.PLATFORM.FORBIDDEN"
}
```

(Los datos son los ya explicados en el Escenario 6.)

Contraste: con el usuario **A** entrando por `POST /api/platform/auth/login` (Escenario 1) el mismo tipo de cuenta sí recibe `200`.

### Escenario 8 — Filtros fuera de contrato

Objetivo: comprobar que un filtro que el listado no admite —un estado que no existe o una página de más de 100 empresas— se rechaza con el mismo aviso claro y no con una lista a medias ni con un error del servidor.

Usuario: **A** (token de la consola).

**Paso 1 — Estado que no existe.**

**Endpoint:** `GET /api/platform/legal-acceptances?status=foo`

**Response exacto:** `422`

```json
{
  "type": "error",
  "title": "Filtros de aceptaciones inválidos",
  "detail": "Revisa la búsqueda (1 a 191 caracteres), el estado (al-dia, pendiente o nunca), la página y el límite (máximo 100).",
  "key": "filtros-de-aceptaciones-invalidos",
  "code": "CONSENT.PLATFORM.001"
}
```

**Paso 2 — Más de 100 por página.**

**Endpoint:** `GET /api/platform/legal-acceptances?limit=101`

**Response exacto:** `422` (el mismo cuerpo del Paso 1).

Qué significa lo nuevo aquí:

- `type`: aquí vale `error` (los filtros mandados no son válidos y no se hizo ninguna consulta); recuerda que en el Escenario 5 valía `warning`.
- `title` / `detail`: el encabezado y la frase, que recuerda las reglas de los filtros. El mismo texto sale sea cual sea el filtro que falló.
- `key`: clave fija de este rechazo; `filtros-de-aceptaciones-invalidos` quiere decir que algún filtro no es válido.
- `code`: identificador estable del rechazo; puede valer `CONSENT.PLATFORM.001` (algún filtro de aceptaciones no es válido; el único valor de este manual).

## 3. Limpieza

Este recorrido encendió un interruptor global: apagó las versiones vigentes de Términos y de Aviso que había antes. Para dejarlas como las deja el resto del seeder compartido (las versiones `QA-LEGAL-1`), corre estas dos consultas, en este orden:

```sql
UPDATE legal_documents
SET legal_document_is_current = 0
WHERE legal_document_version LIKE 'QA-ACEP-%';
```

```sql
UPDATE legal_documents
SET legal_document_is_current = 1
WHERE legal_document_version = 'QA-LEGAL-1'
  AND legal_document_type IN ('terms_conditions', 'privacy_notice');
```

Comprobación:

```sql
SELECT legal_document_type, legal_document_version
FROM legal_documents
WHERE legal_document_is_current = 1
  AND legal_document_type IN ('terms_conditions', 'privacy_notice')
ORDER BY legal_document_type;
```

Resultado: 2 filas: `privacy_notice` con `QA-LEGAL-1` y `terms_conditions` con `QA-LEGAL-1`.

Para repetir el recorrido, vuelve a correr el seeder de Preparar: deja de nuevo como vigentes las versiones de este manual.

## 4. Lo que no se revisa aquí

- **Que un documento no tenga ninguna versión vigente** (`currentVersions` en `null` y `status` en `sin-version-publicada`): en este ambiente los dos documentos siempre quedan con versión vigente, y apagarla a mano afectaría a todo el que comparta la base; no es revisable aquí.
- **El listado completo de todas las empresas de la base, sin búsqueda:** su contenido y su `meta.total` dependen de las empresas de otras historias; aquí solo se revisan las empresas con el prefijo `QA Aceptacion`.
- **Otros filtros inválidos** (p. ej. `page=0` o una búsqueda de más de 191 caracteres): reciben el mismo rechazo del Escenario 8; no llevan escenario propio.

## 5. Checklist

- [ ] Escenario 1: `QA Aceptacion Al Dia` sale `al-dia` en ambos documentos, `QA Aceptacion Nunca` sale `nunca` en ambos y `QA Aceptacion Pendiente` sale `pendiente` en Términos y `nunca` en Aviso, con `currentVersions` y `meta` (`total` `3`)
- [ ] Escenario 2: `status=pendiente` trae solo `QA Aceptacion Pendiente` y `status=al-dia` trae solo `QA Aceptacion Al Dia`
- [ ] Escenario 3: la búsqueda por nombre y por RFC completo encuentra la empresa correcta sin que el RFC aparezca en la respuesta, y una búsqueda sin coincidencias da `data` vacío con `total` `0`
- [ ] Escenario 4: con `limit=1` la página 1 es `QA Aceptacion Al Dia`, la 3 es `QA Aceptacion Pendiente` y `lastPage` vale `3`
- [ ] Escenario 5: sin token da `401` con `AUTH.TOKEN.MISSING`
- [ ] Escenario 6: el token del backoffice de la cuenta propietaria da `403` con `AUTH.PLATFORM.FORBIDDEN`
- [ ] Escenario 7: el token del backoffice de un administrador de plataforma da el mismo `403`
- [ ] Escenario 8: `status=foo` y `limit=101` dan `422` con `CONSENT.PLATFORM.001`
- [ ] Limpieza: las versiones vigentes de Términos y Aviso quedaron como `QA-LEGAL-1`
