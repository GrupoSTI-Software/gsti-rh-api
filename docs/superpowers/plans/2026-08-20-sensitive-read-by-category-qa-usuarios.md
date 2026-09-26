# QA manual API — USRH1787204602825 (lectura sensible por categoría)

Auditoría **manual solo API**. Misma gente y mismo colaborador que el playbook del BO (`gsti-rh-bo/docs/superpowers/plans/2026-08-20-employee-file-sensitive-category-permissions-qa-usuarios.md`). Aquí no hay pestañas, lápices ni Badges: se mira **status + JSON**.

Password de todos: `password`.  
API: `http://127.0.0.1:3333`  
Si ya tenías token, **vuelve a hacer login** (el árbol de sesión no se recarga solo; el limiter es 5 intentos / 15 min por correo).

**Qué cubre:** las 11 columnas `maskedInApi: true` + el árbol `GET /api/auth/session/permissions` (grant **nuevo o** legacy).  
**Qué no cubre:** escrituras (`PUT`/`POST`), `pii_reveal`, biométricos en payload (orden 30 no tiene columna `maskedInApi` biométrica), interruptor del módulo Empleados (queda **OFF**).

Tras el fix del árbol (`isCatalogActionGranted`) hay que **reiniciar el API** y **login de nuevo**. Un rol con `sensitive-identificacion-read` y **sin** `reveal-sensitive-data` debe salir `allowed: true`.

---

## Contratos fijos

Falta de categoría **nunca** es 403 / `PERM.DENIED`. HTTP 200 con el dato tapado o en claro.

`sensitive-*-write` **no cambia** el GET: solo el árbol. Dos usuarios que difieren solo en write (Nóminas vs Nóminas+fin-write) deben devolver **el mismo** JSON de ficha / bancos / médica.

`sensitive-biometrico-read` **no destapa** ninguna de las 11. Solo cambia `allowed` en el árbol.

Login y `GET /api/auth/session` **no** montan ALS: `user.person` viaja **tapado** aunque el rol tenga `sensitive-contacto-read`. Eso es fail-closed declarado, no bug de esta HU.

Bypass `standard`: `owner` / `root` → 11 en claro y árbol `reason: "privileged-role"`. `super-administrador` necesita el slug.

### Las 11 columnas

| Superficie | Path JSON | Campos | Categoría | Grant que destapa |
|---|---|---|---|---|
| Ficha / persona | `data.employee.person` o `data.person` | `personCurp`, `personRfc`, `personImssNss` | identificación | `sensitive-identificacion-read` |
| Ficha / persona | igual | `personEmail`, `personPhone`, `personPhoneSecondary` | contacto | `sensitive-contacto-read` |
| Bancos | `data.employeeBank` o filas de `/banks` | `employeeBankAccountClabe`, `employeeBankAccountNumber`, `employeeBankAccountCardNumber` | financiero | `sensitive-financiero-read` |
| Médica | `data.showEmployeeMedicalCondition` o ítems de `/employee/:id` | `employeeMedicalConditionDiagnosis`, `employeeMedicalConditionNotes` | salud | `sensitive-salud-read` |

Siempre en claro (fuera de las 11): `personFirstname`, `employeeCode`, nombre del banco, título de la condición, `dailySalary` (orden 31).

### Cómo se ve tapado (`maskSensitiveValue`, carácter `•` U+2022)

| Categoría | Regla | Ejemplo |
|---|---|---|
| identificación / financiero / teléfono | `•` × (len − 4) + últimos 4 | CURP de 18 → 14 `•` + 4; CLABE `…7771` → máscara que **termina en** `7771` |
| correo | primer carácter + `•••@` + dominio | `ana@empresa.com` → `a•••@empresa.com` |
| salud | fijo `•••••` | diagnóstico y notas = exactamente 5 `•` |

Si el valor en claro tiene 4 o menos caracteres, se tapan todos.

### Cómo leer el árbol

Módulo `employees` → sección `datos-sensibles`. Por acción: `slug`, `allowed`, `reason`.

| `allowed` | `reason` típico |
|---|---|
| `true` (rol plano con grant) | `assignment` |
| `false` (rol plano sin grant) | `missing-assignment` |
| `true` (`owner` / `root`) | `privileged-role` |

---

## 0. Arranque (una vez)

Sustituye IDs. El header de unidad es el **public id** (UUID), no el entero.

```bash
API=http://127.0.0.1:3333
EMAIL=qa-file-privileged@gsti-tests.local   # o el owner del tenant QA
PASS=password
```

### 0.1 Login

**Request**

```http
POST /api/auth/login
Content-Type: application/json

{
  "userEmail": "qa-file-privileged@gsti-tests.local",
  "userPassword": "password",
  "deviceOrigin": "web"
}
```

```bash
curl -sS -X POST "$API/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"userEmail\":\"$EMAIL\",\"userPassword\":\"$PASS\",\"deviceOrigin\":\"web\"}"
```

**Response 200**

```json
{
  "type": "success",
  "title": "Login",
  "message": "You have successfully logged in",
  "data": {
    "token": "<string JWT/opaco, no objeto>",
    "refreshToken": "<string>",
    "user": {
      "userEmail": "qa-file-privileged@gsti-tests.local",
      "person": {
        "personEmail": "<TAPADO aunque el rol pueda leer contacto>"
      }
    }
  }
}
```

```bash
TOKEN=$(curl -sS -X POST "$API/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"userEmail\":\"$EMAIL\",\"userPassword\":\"$PASS\",\"deviceOrigin\":\"web\"}" \
  | jq -r '.data.token')
```

### 0.2 Unidad de negocio

**Request**

```http
GET /api/auth/session
Authorization: Bearer <TOKEN>
```

**Response 200** — usuario Lucid en la raíz (no `{ data }`). Tomar:

`person.employee.businessUnit.businessUnitPublicId`

```bash
BU=$(curl -sS "$API/api/auth/session" -H "Authorization: Bearer $TOKEN" \
  | jq -r '.person.employee.businessUnit.businessUnitPublicId')
```

### 0.3 IDs de QA-EMP-01

**Request**

```http
GET /api/employees/?search=QA-EMP-01
Authorization: Bearer <TOKEN>
X-Business-Unit-Id: <BU>
```

**Response 200** — filas en `data.employees.data[]` o `data.employees[]`.

Anotar:

| Variable | De dónde |
|---|---|
| `EMPLOYEE_ID` | `employeeId` de QA-EMP-01 |
| `PERSON_ID` | `person.personId` (ficha) |
| `BANK_ID` | `GET /api/employees/{EMPLOYEE_ID}/banks` → `employeeBankId` del banco “QA Banco Expediente” |
| `MEDICAL_ID` | `GET /api/employee-medical-conditions/employee/{EMPLOYEE_ID}` → `employeeMedicalConditionId` de “QA Condición Expediente” |

Con el usuario privilegiado, **copia los 11 valores en claro**. Ese es el oráculo. En el resto de usuarios comparas contra esos claros o contra `maskSensitiveValue`.

```bash
AUTH=(-H "Authorization: Bearer $TOKEN" -H "X-Business-Unit-Id: $BU")

curl -sS "$API/api/employees/$EMPLOYEE_ID" "${AUTH[@]}" \
  | jq '{status: "ver HTTP", person: .data.employee.person | {personFirstname, personCurp, personRfc, personImssNss, personEmail, personPhone, personPhoneSecondary}}'

curl -sS "$API/api/employees/$EMPLOYEE_ID/banks" "${AUTH[@]}" \
  | jq '{clabe: (.. | .employeeBankAccountClabe? // empty), account: (.. | .employeeBankAccountNumber? // empty), card: (.. | .employeeBankAccountCardNumber? // empty)}'

curl -sS "$API/api/employee-medical-conditions/employee/$EMPLOYEE_ID" "${AUTH[@]}" \
  | jq '.data.employeeMedicalConditions[] | {id: .employeeMedicalConditionId, diagnosis: .employeeMedicalConditionDiagnosis, notes: .employeeMedicalConditionNotes}'
```

Árbol (sin header de unidad):

```bash
curl -sS "$API/api/auth/session/permissions" -H "Authorization: Bearer $TOKEN" \
  | jq '.data.modules[] | select(.slug=="employees") | .sections[] | select(.slug=="datos-sensibles") | .actions[] | {slug, allowed, reason}'
```

Plantilla de ficha / persona / banco / médica (repite en cada escenario cambiando `TOKEN`):

```http
GET /api/employees/{EMPLOYEE_ID}
Authorization: Bearer <TOKEN>
X-Business-Unit-Id: <BU>

GET /api/persons/{PERSON_ID}
Authorization: Bearer <TOKEN>

GET /api/employees/{EMPLOYEE_ID}/banks
Authorization: Bearer <TOKEN>
X-Business-Unit-Id: <BU>

GET /api/employee-banks/{BANK_ID}
Authorization: Bearer <TOKEN>
X-Business-Unit-Id: <BU>

GET /api/employee-medical-conditions/employee/{EMPLOYEE_ID}
Authorization: Bearer <TOKEN>
X-Business-Unit-Id: <BU>

GET /api/employee-medical-conditions/{MEDICAL_ID}
Authorization: Bearer <TOKEN>
X-Business-Unit-Id: <BU>

GET /api/auth/session/permissions
Authorization: Bearer <TOKEN>
```

`GET /api/persons/:id` **no** lleva `X-Business-Unit-Id`.

---

## Colaborador

| Código | Nombre | Para qué |
|---|---|---|
| **QA-EMP-01** | Ana García López | Oráculo. Banco “QA Banco Expediente” (CLABE termina en `7771`). Salud “QA Condición Expediente”. |

---

## 1. `qa-file-all-readonly@gsti-tests.local`

**Rol:** `qa-file-all-readonly`  
**Grants sensibles:** ninguno.

### Login

Mismo request que 0.1 con este email. **Response 200**, `data.token` string. `data.user.person.personEmail` **tapado**.

### Árbol

**Request:** `GET /api/auth/session/permissions`

**Response 200** — las 10 de `datos-sensibles`:

```json
{ "slug": "sensitive-identificacion-read", "allowed": false, "reason": "missing-assignment" }
{ "slug": "sensitive-identificacion-write", "allowed": false, "reason": "missing-assignment" }
{ "slug": "sensitive-contacto-read", "allowed": false, "reason": "missing-assignment" }
{ "slug": "sensitive-contacto-write", "allowed": false, "reason": "missing-assignment" }
{ "slug": "sensitive-financiero-read", "allowed": false, "reason": "missing-assignment" }
{ "slug": "sensitive-financiero-write", "allowed": false, "reason": "missing-assignment" }
{ "slug": "sensitive-salud-read", "allowed": false, "reason": "missing-assignment" }
{ "slug": "sensitive-salud-write", "allowed": false, "reason": "missing-assignment" }
{ "slug": "sensitive-biometrico-read", "allowed": false, "reason": "missing-assignment" }
{ "slug": "sensitive-biometrico-write", "allowed": false, "reason": "missing-assignment" }
```

### Ficha `GET /api/employees/{EMPLOYEE_ID}`

**Response 200** (no `PERM.DENIED`)

```json
{
  "type": "success",
  "data": {
    "employee": {
      "person": {
        "personFirstname": "Ana",
        "personCurp": "<máscara últimos 4>",
        "personRfc": "<máscara últimos 4>",
        "personImssNss": "<máscara últimos 4>",
        "personEmail": "<x•••@dominio>",
        "personPhone": "<máscara últimos 4>",
        "personPhoneSecondary": "<máscara últimos 4>"
      }
    }
  }
}
```

`personCurp` / email **distintos** de los claros del paso 0.3.

### Bancos `GET /api/employees/{EMPLOYEE_ID}/banks` y `GET /api/employee-banks/{BANK_ID}`

**Response 200**

```json
{
  "employeeBankAccountClabe": "<máscara que termina en 7771>",
  "employeeBankAccountNumber": "<máscara últimos 4>",
  "employeeBankAccountCardNumber": "<máscara últimos 4>"
}
```

El nombre del banco (“QA Banco Expediente”) sigue en claro.

### Médica

**Response 200**

```json
{
  "employeeMedicalConditionDiagnosis": "•••••",
  "employeeMedicalConditionNotes": "•••••"
}
```

Exactamente 5 `•`. El título de la condición sigue en claro.

### Persona `GET /api/persons/{PERSON_ID}`

**Response 200.** Mismos 6 campos de person que la ficha: identificación y contacto **tapados**.

---

## 2. `qa-file-hr-admin@gsti-tests.local`

**Rol:** `qa-file-hr-admin`  
**Grants:** las 10 `sensitive-*` (sin exigir `reveal-sensitive-data`).

### Login

**Response 200.** Token string. Person del login **sigue tapada**.

### Árbol

**Response 200** — las 10:

```json
{ "slug": "sensitive-identificacion-read", "allowed": true, "reason": "assignment" }
{ "slug": "sensitive-identificacion-write", "allowed": true, "reason": "assignment" }
{ "slug": "sensitive-contacto-read", "allowed": true, "reason": "assignment" }
{ "slug": "sensitive-contacto-write", "allowed": true, "reason": "assignment" }
{ "slug": "sensitive-financiero-read", "allowed": true, "reason": "assignment" }
{ "slug": "sensitive-financiero-write", "allowed": true, "reason": "assignment" }
{ "slug": "sensitive-salud-read", "allowed": true, "reason": "assignment" }
{ "slug": "sensitive-salud-write", "allowed": true, "reason": "assignment" }
{ "slug": "sensitive-biometrico-read", "allowed": true, "reason": "assignment" }
{ "slug": "sensitive-biometrico-write", "allowed": true, "reason": "assignment" }
```

Si `sensitive-identificacion-read` sale `allowed: false`, el API no tiene el helper `isCatalogActionGranted` o la sesión es vieja.

### Ficha / persona

**Response 200.** Los 6 de person = **claros** del paso 0.3.

### Bancos

**Response 200.** CLABE / cuenta / tarjeta = **claros** (CLABE termina en `7771` **sin** muro de `•`).

### Médica

**Response 200.** Diagnóstico y notas = **claros** (no `•••••`).

---

## 4. `qa-file-supervisor-lite@gsti-tests.local`

**Grants sensibles:** ninguno. Igual que el usuario 1 en payload.

### Árbol

Las 10 `sensitive-*` → `allowed: false` / `missing-assignment`.

### Ficha / persona / bancos / médica

**Response 200.** Las 11 **tapadas** (misma forma que el usuario 1). Nombre y `personFirstname` en claro.

---

## 5. `qa-file-banks-readonly@gsti-tests.local`

**Grants sensibles:** ninguno.

### Árbol

`sensitive-financiero-read` y `-write` → `allowed: false`.

### Bancos

**Response 200.** CLABE / cuenta / tarjeta **tapadas**. Nombre del banco en claro.

### Ficha

**Response 200.** Person identificación + contacto **tapados** (este rol no tiene esas lecturas). No 403.

---

## 7. `qa-file-medical-readonly@gsti-tests.local`

**Grants sensibles:** ninguno.

### Árbol

`sensitive-salud-read` / `-write` → `allowed: false`.

### Médica

**Response 200**

```json
{
  "employeeMedicalConditionDiagnosis": "•••••",
  "employeeMedicalConditionNotes": "•••••"
}
```

Título de la condición en claro. No 403.

---

## 15. `qa-file-biometrics-only@gsti-tests.local`

**Lista:** pestaña biométricos R/W. **Sin** `sensitive-biometrico-*`.

### Árbol

```json
{ "slug": "sensitive-biometrico-read", "allowed": false, "reason": "missing-assignment" }
{ "slug": "sensitive-biometrico-write", "allowed": false, "reason": "missing-assignment" }
```

El resto de `sensitive-*` también `false`.

### Ficha / bancos / médica

**Response 200.** Las 11 **tapadas**. `tab-biometricos-write` no destapa CURP ni CLABE ni diagnóstico.

No hay columna biométrica en esta HU: no existe un GET de rostro/huellas que cambie con este grant.

---

## 17. `qa-file-nominas@gsti-tests.local`

**Tiene:** `sensitive-financiero-read`, `sensitive-contacto-read`, `sensitive-contacto-write`.  
**No tiene:** `sensitive-identificacion-*`, `sensitive-financiero-write`, `sensitive-salud-*`, `sensitive-biometrico-*`.

### Árbol

```json
{ "slug": "sensitive-contacto-read", "allowed": true, "reason": "assignment" }
{ "slug": "sensitive-contacto-write", "allowed": true, "reason": "assignment" }
{ "slug": "sensitive-financiero-read", "allowed": true, "reason": "assignment" }
{ "slug": "sensitive-financiero-write", "allowed": false, "reason": "missing-assignment" }
{ "slug": "sensitive-identificacion-read", "allowed": false, "reason": "missing-assignment" }
{ "slug": "sensitive-identificacion-write", "allowed": false, "reason": "missing-assignment" }
{ "slug": "sensitive-salud-read", "allowed": false, "reason": "missing-assignment" }
{ "slug": "sensitive-salud-write", "allowed": false, "reason": "missing-assignment" }
```

### Ficha `GET /api/employees/{EMPLOYEE_ID}`

**Response 200**

```json
{
  "person": {
    "personFirstname": "Ana",
    "personCurp": "<TAPADO>",
    "personRfc": "<TAPADO>",
    "personImssNss": "<TAPADO>",
    "personEmail": "<CLARO = oráculo 0.3>",
    "personPhone": "<CLARO>",
    "personPhoneSecondary": "<CLARO>"
  }
}
```

### Bancos

**Response 200.** CLABE / cuenta / tarjeta **claros**. (`sensitive-financiero-write` ausente no los tapa.)

### Médica

**Response 200.** Diagnóstico y notas = `•••••`.

### Persona `GET /api/persons/{PERSON_ID}`

Igual que la ficha: contacto claro, identificación tapada.

---

## 18. `qa-file-nominas-fin-write@gsti-tests.local`

**Lista:** las de Nóminas + `sensitive-financiero-write`. Contraste CA-7 **sin mutar** el rol 17.

### Árbol (única diferencia vs 17)

```json
{ "slug": "sensitive-financiero-read", "allowed": true, "reason": "assignment" }
{ "slug": "sensitive-financiero-write", "allowed": true, "reason": "assignment" }
{ "slug": "sensitive-identificacion-read", "allowed": false, "reason": "missing-assignment" }
```

### Ficha / bancos / médica

**Response 200 idéntico al usuario 17.** Write no altera GET. CURP sigue tapado; CLABE sigue clara.

---

## 19. `qa-file-supervisor-bio-none@gsti-tests.local`

**CA-4.** Pestaña biométricos read. Sin `sensitive-biometrico-*`.

### Árbol

```json
{ "slug": "sensitive-biometrico-read", "allowed": false, "reason": "missing-assignment" }
{ "slug": "sensitive-biometrico-write", "allowed": false, "reason": "missing-assignment" }
```

### Ficha / bancos / médica

**Response 200.** Las 11 tapadas (no tiene lecturas de las otras categorías).

---

## 20. `qa-file-supervisor-bio-readonly@gsti-tests.local`

**CA-5.** `sensitive-biometrico-read`. Sin writes de categoría ni de pestaña.

### Árbol

```json
{ "slug": "sensitive-biometrico-read", "allowed": true, "reason": "assignment" }
{ "slug": "sensitive-biometrico-write", "allowed": false, "reason": "missing-assignment" }
```

### Ficha / bancos / médica

**Response 200.** Las 11 **siguen tapadas**. Este grant no destapa CURP, correo, CLABE ni diagnóstico.

---

## 21. `qa-file-privileged@gsti-tests.local`

**Rol:** `owner`. **CA-9.**

### Login

**Response 200.** Token. Person del login **tapada** (sin ALS), aunque el árbol sea privilegiado.

### Árbol

Las 10 `sensitive-*`:

```json
{ "slug": "sensitive-identificacion-read", "allowed": true, "reason": "privileged-role" }
```

(igual `allowed: true` / `privileged-role` en las otras nueve).

### Ficha / persona / bancos / médica

**Response 200.** Las 11 **claras** = oráculo 0.3. No hace falta que el rol tenga filas `sensitive-*` en BD.

---

## Extra A. Sin sesión (ficha)

**Request**

```http
GET /api/employees/{EMPLOYEE_ID}
X-Business-Unit-Id: <BU>
```

(sin `Authorization`)

**Response 401.** El JSON **no** contiene el email ni el CURP en claro de QA-EMP-01. `key` **no** es `PERM.DENIED`.

---

## Extra B. Login con contacto concedido

Usuario 2 o 17.

**Request:** `POST /api/auth/login` con su email.

**Response 200.** `data.user.person.personEmail` y `personPhone` **tapados** (máscara), **distintos** de los claros del actor. El mismo token en `GET /api/employees/{EMPLOYEE_ID}` **sí** destapa el correo de QA-EMP-01 si el rol tiene `sensitive-contacto-read`.

---

## Extra C. Dirección general (si hay usuario en el tenant)

Login como `super-administrador` **sin** slugs `sensitive-*-read`.

**Árbol:** `sensitive-identificacion-read` → `allowed: false` (no es bypass).  
**Ficha:** las 11 tapadas.  
Si al rol se le conceden las cinco lecturas, ficha = 11 claras y árbol `assignment` (no `privileged-role`).

---

## Fuera (no auditar aquí)

| Tema | Por qué |
|---|---|
| Badges / lápiz / pestañas del BO | Playbook del BO |
| `PUT` de person/banco/médica | Escritura es otra HU / el BO |
| `pii_reveal` | Fuera de alcance |
| Salario diario enmascarado | Orden 31; hoy viaja completo |
| `qa-roles-editor` | No es oráculo de expediente API |
| Encender `system_module_permission_enforcement_active` | Entrega apagada |
