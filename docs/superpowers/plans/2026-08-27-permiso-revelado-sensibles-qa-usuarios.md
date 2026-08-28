# Recorrido manual — permiso de revelado por categoría

Historia **USRH1787433076989**. Password de todos: `password`.  
API: `http://127.0.0.1:3333`

Esta HU cierra la puerta trasera del **revelado** y protege la **bitácora**.  
**No usa** el slug legacy `reveal-sensitive-data`; el gate va por categoría legal.

Si faltan usuarios, permisos o QA-EMP-01, **vuelve a correr el seeder** (hr-admin recibe bitácora ahí):

```bash
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Luego **logout/login** para recargar el árbol de permisos.

---

## Alcance de la HU — campos y slugs

### Revelado — 11 columnas (`GET /api/v1/pii/reveal/{modelo}/{columna}/{recordId}`)

Módulo: **`employees`**. Slug: **`sensitive-{categoría}-read`**.

| # | Modelo | Columna | Categoría | Slug que exige | URL de prueba (QA-EMP-01) |
|---|---|---|---|---|---|
| 1 | `Person` | `personCurp` | identificación | `sensitive-identificacion-read` | `/api/v1/pii/reveal/Person/personCurp/29` |
| 2 | `Person` | `personRfc` | identificación | `sensitive-identificacion-read` | `/api/v1/pii/reveal/Person/personRfc/29` |
| 3 | `Person` | `personImssNss` | identificación | `sensitive-identificacion-read` | `/api/v1/pii/reveal/Person/personImssNss/29` |
| 4 | `Person` | `personEmail` | contacto | `sensitive-contacto-read` | `/api/v1/pii/reveal/Person/personEmail/29` |
| 5 | `Person` | `personPhone` | contacto | `sensitive-contacto-read` | `/api/v1/pii/reveal/Person/personPhone/29` |
| 6 | `Person` | `personPhoneSecondary` | contacto | `sensitive-contacto-read` | `/api/v1/pii/reveal/Person/personPhoneSecondary/29` |
| 7 | `EmployeeBank` | `employeeBankAccountClabe` | financiero | `sensitive-financiero-read` | `/api/v1/pii/reveal/EmployeeBank/employeeBankAccountClabe/1` |
| 8 | `EmployeeBank` | `employeeBankAccountNumber` | financiero | `sensitive-financiero-read` | `/api/v1/pii/reveal/EmployeeBank/employeeBankAccountNumber/1` |
| 9 | `EmployeeBank` | `employeeBankAccountCardNumber` | financiero | `sensitive-financiero-read` | `/api/v1/pii/reveal/EmployeeBank/employeeBankAccountCardNumber/1` |
| 10 | `EmployeeMedicalCondition` | `employeeMedicalConditionDiagnosis` | salud | `sensitive-salud-read` | `/api/v1/pii/reveal/EmployeeMedicalCondition/employeeMedicalConditionDiagnosis/1` |
| 11 | `EmployeeMedicalCondition` | `employeeMedicalConditionNotes` | salud | `sensitive-salud-read` | `/api/v1/pii/reveal/EmployeeMedicalCondition/employeeMedicalConditionNotes/1` |

- **Con el slug de la categoría** → **200** + valor en claro + asiento en `pii_access_logs`.
- **Sin el slug** → **403** `EMP.SENS.READ.FORBIDDEN` (sin asiento, sin filtrar el valor).
- **Columna fuera del catálogo** (ej. `personFirstname`) → **422** `EMP.SENS.READ.NOT_CLASSIFIED` (el 403 no se adelanta).

**Fuera del revelado de esta HU:** `sensitive-biometrico-read` existe como slug de tapado en ficha, pero **ninguna columna biométrica** entra al endpoint `/pii/reveal`.

### Bitácora — 1 acción (`GET /api/v1/pii/access-logs`)

| Qué | Módulo | Acción | Slug |
|---|---|---|---|
| Listar accesos a datos sensibles | `sensitive-data-access-log` | `read` | `sensitive-data-access-log` → `read` |

- **Con el slug** → **200**.
- **Sin el slug** → **403** `SEC.AUD.FORB.001` / `consulta-bitacora-denegada`.

---

## Colaborador de prueba (QA-EMP-01)

| Campo | Valor |
|---|---|
| Código | `QA-EMP-01` (Ana García López) |
| `employee_id` | **1** |
| `person_id` | **29** |
| `bank_id` | **1** |
| `medical_id` | **1** |
| `X-Business-Unit-Id` | **ece8d5b8-dc93-4a20-8835-b09b1cd733bf** |

> IDs de tu BD local tras el seeder. En otra máquina: `GET /api/employees/?search=QA-EMP-01`.

---

## Dos usuarios de prueba

| | **Usuario A — con todo** | **Usuario B — sin nada sensible** |
|---|---|---|
| Email | `qa-file-hr-admin@gsti-tests.local` | `qa-file-all-readonly@gsti-tests.local` |
| Password | `password` | `password` |
| Rol | `qa-file-hr-admin` | `qa-file-all-readonly` |

### Usuario A — permisos concedidos

**Revelado** (módulo `employees`, sección datos sensibles):

- `sensitive-identificacion-read` ✓
- `sensitive-contacto-read` ✓
- `sensitive-financiero-read` ✓
- `sensitive-salud-read` ✓
- `sensitive-biometrico-read` ✓

**Bitácora** (módulo `sensitive-data-access-log`):

- `read` ✓ *(el seeder lo concede a `qa-file-hr-admin`)*

### Usuario B — permisos denegados

- Todos los `sensitive-*-read` ✗
- `sensitive-data-access-log` → `read` ✗

(Tiene pestañas de consulta del expediente, pero **cero** permisos de datos sensibles ni bitácora.)

---

## 1. Login

**Usuario A** (revelado + bitácora):

```http
POST /api/auth/login
Content-Type: application/json

{
  "userEmail": "qa-file-hr-admin@gsti-tests.local",
  "userPassword": "password",
  "deviceOrigin": "web"
}
```

**Usuario B** (contraste denegado): cambia el email a `qa-file-all-readonly@gsti-tests.local`.

Del `200` toma `data.token`.

Headers para revelado y bitácora:

```
Authorization: Bearer <TOKEN>
X-Business-Unit-Id: ece8d5b8-dc93-4a20-8835-b09b1cd733bf
```

---

## 2. Endpoints de revelado (copy-paste)

Sustituye solo `<TOKEN>`. La tabla de arriba lista las **11 columnas**; aquí van tres atajos (una por categoría):

### CURP — categoría identificación

```http
GET /api/v1/pii/reveal/Person/personCurp/29
Authorization: Bearer <TOKEN>
X-Business-Unit-Id: ece8d5b8-dc93-4a20-8835-b09b1cd733bf
```

### CLABE — categoría financiero

```http
GET /api/v1/pii/reveal/EmployeeBank/employeeBankAccountClabe/1
Authorization: Bearer <TOKEN>
X-Business-Unit-Id: ece8d5b8-dc93-4a20-8835-b09b1cd733bf
```

### Diagnóstico — categoría salud

```http
GET /api/v1/pii/reveal/EmployeeMedicalCondition/employeeMedicalConditionDiagnosis/1
Authorization: Bearer <TOKEN>
X-Business-Unit-Id: ece8d5b8-dc93-4a20-8835-b09b1cd733bf
```

---

## 3. Resultado esperado (revelado)

| Endpoint | Usuario A | Usuario B |
|---|---|---|
| CURP `/Person/personCurp/29` | **200** | **403** `EMP.SENS.READ.FORBIDDEN` |
| CLABE `/EmployeeBank/.../1` | **200** | **403** |
| Diagnóstico `/EmployeeMedicalCondition/.../1` | **200** | **403** |

**403 de revelado** (solo Usuario B):

```json
{
  "title": "Sin permiso para revelar datos sensibles",
  "detail": "No tienes permiso para consultar datos de identificación.",
  "key": "sin-permiso-para-revelar-datos-sensibles",
  "code": "EMP.SENS.READ.FORBIDDEN"
}
```

---

## 4. Bitácora de accesos a datos sensibles

Módulo BO: **Bitácora de accesos a datos sensibles** (`/sensitive-data-access-log`).

```http
GET /api/v1/pii/access-logs
Authorization: Bearer <TOKEN>
X-Business-Unit-Id: ece8d5b8-dc93-4a20-8835-b09b1cd733bf
```

| Usuario | Resultado esperado |
|---|---|
| A — hr-admin | **200** |
| B — all-readonly | **403** `SEC.AUD.FORB.001` / `consulta-bitacora-denegada` |

**403 de bitácora** (solo Usuario B):

```json
{
  "key": "consulta-bitacora-denegada",
  "code": "SEC.AUD.FORB.001",
  "data": null
}
```

---

## 5. Confirmar permisos en sesión

```http
GET /api/auth/session/permissions
Authorization: Bearer <TOKEN>
```

Módulo `employees` → sección `datos-sensibles`:

| Slug | Usuario A | Usuario B |
|---|---|---|
| `sensitive-identificacion-read` | `allowed: true` | `allowed: false` |
| `sensitive-contacto-read` | `allowed: true` | `allowed: false` |
| `sensitive-financiero-read` | `allowed: true` | `allowed: false` |
| `sensitive-salud-read` | `allowed: true` | `allowed: false` |
| `sensitive-biometrico-read` | `allowed: true` | `allowed: false` |

Módulo `sensitive-data-access-log`:

| Slug | Usuario A | Usuario B |
|---|---|---|
| `read` | `allowed: true` | `allowed: false` |
