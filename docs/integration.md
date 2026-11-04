# 연동 가이드

외부 시스템(출입 통제, 영상 분석, 센서 게이트웨이 등)이 dt로 메시지를 보내는 방법을 설명한다. 이 문서만 보고 연동을 끝낼 수 있도록 실제 구현을 기준으로 썼다. 서버가 제공하는 OpenAPI 문서(`/api/docs`)도 함께 볼 수 있다.

## 1. 한눈에 보기

외부 시스템은 HTTP `POST`로 메시지를 보낸다. 받는 창구는 두 개다.

| 창구 | 경로 | 용도 | 알람 | 통계 |
|---|---|---|---|---|
| 이벤트 | `POST /api/ingest/events` | 침입 감지, 화재 감지 같은 사건 | 만든다 | 들어간다 |
| 위치 | `POST /api/ingest/positions` | 사람, 차량, 사물의 위치 | 만들지 않는다 | 들어가지 않는다 |

- 알람과 위치가 모두 필요하면(예: 침입한 사람의 위치) 이벤트 메시지에 좌표와 객체 정보를 담아 보낸다. 이벤트에 좌표가 있으면 3D의 객체 마커도 함께 움직인다.
- 모든 요청과 응답 본문은 `application/json`이다.

준비물은 세 가지다.

1. dt에 등록된 **장치 ID** (설정 > 현장 > 장치 편집기에서 관리자가 정한다. dt 전체에서 유일하다.)
2. **연동 키** (설정 > 연동 키에서 발급. 발급할 때 한 번만 평문이 보인다.)
3. 장치가 놓인 현장의 **평면 좌표**(선택, 4장 참고)

## 2. 인증

두 창구 모두 연동 키를 `Authorization` 헤더로 받는다.

```
Authorization: Bearer dtk_xxxxxxxxxxxxxxxxxxxxxxxx
```

- 키는 `dtk_`로 시작한다. 헤더가 없거나 형식이 다르면 `401 missing_key`, 키가 없거나 폐기됐으면 `401 invalid_key`다.
- 인증 방식 이름 `Bearer`는 대소문자를 가리지 않는다(`bearer dtk_...`도 된다). 키 자체는 대소문자를 구분한다.
- 키는 본문보다 먼저 확인한다. 키가 없거나 틀린 요청은 본문이 잘못됐어도 `400`이 아니라 `401`이다.
- 서버가 키로 메시지의 출처를 구분한다. 외부 시스템마다 키를 따로 발급하면 객체 ID나 이벤트 ID가 시스템끼리 겹쳐도 충돌하지 않는다.
- 키 하나로 여러 현장의 장치에 보낼 수 있다. 장치 ID가 dt 전체에서 유일하므로 메시지에 현장 필드가 없다.
- 키는 해시로만 저장된다. 잃어버리면 새로 발급하고 이전 키를 폐기한다.

## 3. 공통 규칙

### 장치 ID

- 패턴: `^[A-Za-z0-9._-]{1,64}$`
- dt에 등록되지 않은 장치 ID는 `404 unknown_device`로 거부한다. 위치 배치(배열)에 모르는 ID가 하나라도 있으면 배치 전체가 거부되고, `details.deviceIds`에 모르는 ID 목록이 담긴다.
- 메시지의 층은 장치 ID로 정해진다. 메시지에 높이 값은 없다.

### 시각

- ISO 8601이며 **시간대를 포함해야 한다.** 예: `2026-11-04T09:30:00+09:00`, `2026-11-04T00:30:00Z`. 시간대가 없는 `2026-11-04T09:30:00`은 `400 validation_error`다.
- 서버 시각보다 **5분을 넘게 미래**인 시각은 거부한다(이벤트 `400 occurred_at_in_future`, 위치 `400 measured_at_in_future`). 장치 시계가 약간 앞서는 정도는 허용된다.
- dt는 발생 시각과 받은 시각을 둘 다 저장한다. 통계는 발생 시각 기준이고, 객체가 사라지는 시점과 알람 묶기는 받은 시각 기준이다.

### 좌표와 높이

- `x`, `y`는 모델 평면 좌표이고 단위는 m다(4장).
- 높이는 받지 않는다. 좌표가 있는 객체와 이벤트는 **장치가 속한 층의 바닥면 위**에 놓인다. 장치가 천장에 달려 있어도 객체는 바닥에 서 있다.
- `x`와 `y`는 함께 보내야 한다. 하나만 보내면 `400 validation_error`다.

### 객체 ID와 유형

- `objectId`가 있으면 ID마다 다른 색상과 라벨로 표시한다(같은 ID는 항상 같은 색이다). 없으면 회색 점이다.
- `objectType`은 `person`(캡슐), `vehicle`(낮은 상자), `object`(정육면체) 중 하나다. 없으면 구로 표시한다.
- 객체 ID는 연동 키별로 구분되므로, 서로 다른 키가 같은 ID를 써도 다른 객체다.

### 객체가 사라지는 규칙

같은 객체의 정보(위치 메시지든, 객체가 담긴 이벤트든)가 더 오지 않으면 다음 순서로 사라진다. 기준은 dt가 마지막으로 **받은** 시각이다.

| 마지막 수신 후 | 표시 |
|---|---|
| 0 ~ 1초 | 불투명 |
| 1 ~ 4초 | 3초 동안 선형으로 투명해진다 |
| 4초 이후 | 제거 |

그러므로 **추적 중인 객체는 최소 1초에 한 번 위치를 보내야** 깜빡이지 않는다. `objectId`가 없는 메시지는 매번 새 회색 점이 되어 위 규칙대로 사라진다.

위치는 DB에 저장하지 않고 서버 메모리에만 둔다(v1에는 이력 재생이 없다). 서버를 재시작하면 현재 객체 목록이 비워진다.

### 한도 요약

| 항목 | 한도 |
|---|---|
| `deviceId` | 패턴 `^[A-Za-z0-9._-]{1,64}$` |
| `eventType` | 1 ~ 64자 |
| `objectId`, `eventId` | 1 ~ 128자 |
| 위치 배치 | 최대 1000건 |
| 요청 본문(이벤트, 위치) | 최대 1 MiB |
| 미래 시각 허용 | 5분 |

## 4. 좌표계

dt는 glTF 표준을 그대로 쓴다. 모델은 **Y축이 위**이고 단위는 m다. API는 평면도 기준 `x`, `y`를 받는다.

```
x = 모델 X
y = -모델 Z
```

위에서 내려다본 평면도에서 x는 오른쪽(동), y는 위쪽(북)이다.

```
        +y (북) = 모델 -Z
         ^
         |
         |
 --------+--------> +x (동) = 모델 +X
 (0, 0)  |
         |
         v
        -y (남) = 모델 +Z

  높이는 모델 +Y(위). API에는 높이 값이 없다.
```

### 장치 방향(yaw, pitch)

카메라 장치의 시야 방향은 설정 화면에서 정하며, 외부 시스템은 보내지 않는다. 참고용 정의는 다음과 같다.

- `yawDeg`: 평면 +y(북)를 0도로 보고 +x(동) 쪽으로 도는 각도다. 90도는 동쪽이다. 저장할 때 0 ~ 360으로 정규화된다.
- `pitchDeg`: 양수가 위쪽이다. 범위는 -90 ~ 90도다.
- 3D 모델의 회전은 Euler 순서 `'YXZ'`, `rotation.y = -yaw`, `rotation.x = pitch`(라디안)이다.

### 좌표 찾는 법

모니터링 화면의 3D 위에 마우스를 올리면 그 지점의 평면 좌표 `x`, `y`(m)가 화면에 표시된다. 보낼 좌표는 이 값을 읽어서 쓰면 된다. 좌표는 선택한 층의 바닥면 기준으로 읽힌다.

## 5. 이벤트 창구

`POST /api/ingest/events` — 메시지 하나가 이벤트 기록 하나가 된다.

### 필드

| 필드 | 필수 | 타입 | 설명 |
|---|---|---|---|
| `deviceId` | O | string | 등록된 장치 ID |
| `eventType` | O | string (1 ~ 64자) | 알람과 대시보드 분류에 쓰는 유형. 예: `intrusion`, `fire` |
| `occurredAt` | O | string (ISO 8601, 시간대 포함) | 사건이 발생한 시각 |
| `severity` | X | `critical` / `major` / `minor` / `info` | 없으면 연동 키의 기본값 |
| `x`, `y` | X | number (m) | 함께 보낸다. 없으면 장치 자체의 위치에 표시한다 |
| `objectId` | X | string (1 ~ 128자) | 외부 시스템이 붙인 객체 식별자 |
| `objectType` | X | `person` / `vehicle` / `object` | 객체 유형 |
| `eventId` | X | string (1 ~ 128자) | 재전송 중복 제거용 식별자 |

### 심각도

- 순서는 `critical > major > minor > info`다.
- `severity`를 생략하면 **연동 키별 기본값**을 쓴다. 기본값의 초기값은 `critical`이고 관리자가 설정 > 연동 키에서 바꿀 수 있다.
- 위 네 값 밖의 문자열은 `400 validation_error`다.

### 알람 묶기

알람 폭주를 막기 위해 같은 상황이 이어지는 동안은 알람 하나로 묶는다.

- **같은 상황:** 연동 키, `deviceId`, `eventType`, `objectId`가 모두 같다. `objectId`가 없으면 앞의 세 개만 비교한다.
- **이어짐:** 같은 상황의 메시지가 직전 메시지로부터 **10초 안에** 오면 이어진다. 10초 넘게 끊겼다가 오면 새 알람이다. 10초는 dt가 메시지를 **받은 시각**으로 잰다.
- **고정되는 것:** 첫 발생 시각(`firstOccurredAt`)은 바뀌지 않는다. `objectId`는 묶음 기준의 일부라서 역시 바뀌지 않는다.
- **합칠 때 갱신되는 것:** 발생 횟수(`count`), 마지막 시각(`lastOccurredAt`, `lastReceivedAt`), 심각도(`severity`, 더 높은 쪽)다.
- **최신 메시지를 따라가는 것:** 알람의 위치(`x`, `y`)와 `objectType`은 좌표나 유형이 담긴 가장 최근 메시지를 따른다. 좌표 없는 메시지가 합쳐져도 기존 위치는 그대로 남는다. 그래서 미확인 알람의 맥박 링이 객체의 현재 위치를 따라간다.
- **확인한 알람:** 이어지는 메시지가 오면 같은 알람에 조용히 합치고 확인 상태를 유지한다. 확인 버튼을 누른 직후 같은 알람이 다시 뜨지 않는다. 이 이어짐은 확인 후에도 계속된다.
- 대시보드의 이벤트 수는 알람 기준이다. 이벤트 메시지 원본은 저장만 한다.
- 객체 마커는 알람 묶기와 무관하게 메시지마다 위치가 갱신된다.

### 이벤트 ID 중복 제거

같은 연동 키에서 같은 `eventId`가 다시 오면 새로 처리하지 않고 `200`과 `status: "duplicate"`로 응답한다. 네트워크 오류로 재전송해도 중복 알람이 생기지 않는다. 재전송할 때는 같은 `eventId`를 그대로 쓴다.

### 응답

| 상태 | 본문 | 의미 |
|---|---|---|
| `201` | `{"status":"created","alarmId":"..."}` | 새 알람을 만들었다 |
| `200` | `{"status":"merged","alarmId":"..."}` | 기존 알람에 합쳤다 |
| `200` | `{"status":"duplicate","alarmId":"..."}` | 이미 처리한 `eventId`다. `alarmId`는 처음 처리한 알람 |

오류는 7장을 본다.

## 6. 위치 창구

`POST /api/ingest/positions` — 3D의 객체 마커만 움직인다. 알람과 통계에는 들어가지 않는다.

### 필드

| 필드 | 필수 | 타입 | 설명 |
|---|---|---|---|
| `deviceId` | O | string | 등록된 장치 ID. 층을 정한다 |
| `x`, `y` | O | number (m) | 평면 좌표 |
| `measuredAt` | O | string (ISO 8601, 시간대 포함) | 측정 시각 |
| `objectId` | X | string (1 ~ 128자) | 없으면 회색 점 |
| `objectType` | X | `person` / `vehicle` / `object` | 객체 유형 |

### 배치

본문은 메시지 하나(객체)이거나 메시지 배열이다. 배열은 1 ~ **1000건**이고 본문은 **1 MiB** 이하여야 한다. 많은 객체를 추적하는 시스템은 배열로 묶어 요청 수를 줄일 수 있다.

배치는 전부 받거나 전부 거부한다. 한 건이라도 검증에 실패하거나 모르는 장치 ID가 있으면 아무것도 반영되지 않는다.

화면에는 약 200ms마다 묶어서 전달된다.

### 응답

| 상태 | 본문 | 의미 |
|---|---|---|
| `202` | `{"accepted": 3}` | 받은 메시지 수 |

## 7. 오류

모든 오류 응답은 같은 형식이다.

```json
{ "code": "unknown_device", "message": "Unknown device", "details": { "deviceIds": ["cam-99"] } }
```

`details`는 없을 수 있다. 값 검증에 실패하면 `400 validation_error`이고 `details`에 어떤 필드가 왜 틀렸는지가 들어 있다.

### 연동 창구에서 받을 수 있는 코드

| HTTP | `code` | 원인 | 조치 |
|---|---|---|---|
| 400 | `validation_error` | 필드 누락, 형식 오류, 시간대 없는 시각, 범위 밖 심각도, 한도 초과, `x`/`y` 중 하나만 전송 | `details`를 보고 고친다. 재전송해도 같은 결과다 |
| 400 | `occurred_at_in_future` | `occurredAt`이 서버 시각보다 5분 넘게 미래 | 장치 시계를 맞춘다 |
| 400 | `measured_at_in_future` | `measuredAt`이 서버 시각보다 5분 넘게 미래 | 장치 시계를 맞춘다 |
| 400 | `bad_request` | JSON이 아닌 본문 등 요청 자체가 잘못됨 | 요청 형식을 확인한다 |
| 401 | `missing_key` | `Authorization: Bearer dtk_...` 헤더가 없거나 형식이 틀림 | 헤더를 확인한다 |
| 401 | `invalid_key` | 키가 없거나 폐기됨 | 새 키를 발급한다 |
| 404 | `unknown_device` | 등록되지 않은 장치 ID | 장치를 등록하거나 ID를 고친다 |
| 404 | `not_found` | 존재하지 않는 경로 | 경로를 확인한다 |
| 409 | `conflict` | 같은 `eventId`를 동시에 보내 충돌했는데 기존 기록을 찾지 못함(드묾) | 같은 `eventId`로 재전송한다 |
| 500 | `internal_error` | 서버 내부 오류 | 잠시 후 재전송한다. 반복되면 서버 로그를 본다 |

요청 본문이 1 MiB를 넘으면 HTTP `413`(`code`는 `bad_request`)이 반환된다. 위치는 배치를 나눠서 보낸다.

재전송 지침: `5xx`와 네트워크 오류는 재전송한다(이벤트는 `eventId`를 붙여 두면 안전하다). `4xx`는 요청을 고치기 전에는 같은 결과다.

### 관리 API 오류 코드 (참고)

설정 화면이 쓰는 관리 API(로그인 세션 필요)가 반환하는 코드다. 연동 시스템은 쓰지 않는다.

| HTTP | `code` | 원인 |
|---|---|---|
| 401 | `unauthenticated`, `invalid_credentials` | 로그인 필요, 아이디·비밀번호 오류 |
| 400 | `invalid_floors`, `floor_not_in_site`, `position_outside_floor` | 층 구간 오류, 장치의 층·위치가 현장과 맞지 않음 |
| 400 | `invalid_tz`, `invalid_range`, `range_too_long` | 통계 조회 조건 오류 |
| 400 | `file_required` | 모델 업로드에 `file` 필드가 없음 |
| 404 | `site_not_found`, `device_not_found`, `alarm_not_found`, `key_not_found`, `no_model` | 대상 없음 |
| 409 | `device_id_taken`, `floor_in_use`, `model_conflict` | 장치 ID 중복, 장치가 쓰는 층 삭제 시도, 모델 동시 변경 |
| 413 | `model_too_large` | 모델 파일이 `MAX_MODEL_MB` 초과 |
| 422 | `not_glb`, `invalid_gltf`, `unsupported_extension` | 모델 파일 오류 ([모델 규격](model-spec.md)) |

## 8. curl 예시

환경변수를 먼저 정한다.

```bash
export DT_URL=http://localhost:8080
export DT_KEY=dtk_xxxxxxxxxxxxxxxxxxxxxxxx
```

### 위치 1건 (객체 ID 있음)

```bash
curl -sS -X POST "$DT_URL/api/ingest/positions" \
  -H "Authorization: Bearer $DT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "cam-1f-lobby",
    "x": 12.5,
    "y": 4.2,
    "measuredAt": "2026-11-04T09:30:00+09:00",
    "objectId": "tag-0042",
    "objectType": "person"
  }'
# {"accepted":1}
```

### 위치 배치 (배열)

```bash
curl -sS -X POST "$DT_URL/api/ingest/positions" \
  -H "Authorization: Bearer $DT_KEY" \
  -H "Content-Type: application/json" \
  -d '[
    {"deviceId":"cam-1f-lobby","x":12.5,"y":4.2,"measuredAt":"2026-11-04T00:30:00Z","objectId":"tag-0042","objectType":"person"},
    {"deviceId":"cam-1f-lobby","x":3.0,"y":8.0,"measuredAt":"2026-11-04T00:30:00Z"}
  ]'
# {"accepted":2}
```

두 번째 메시지는 `objectId`가 없어서 회색 점으로 표시된다.

### 이벤트 (좌표와 객체 포함)

```bash
curl -sS -X POST "$DT_URL/api/ingest/events" \
  -H "Authorization: Bearer $DT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "cam-1f-lobby",
    "eventType": "intrusion",
    "occurredAt": "2026-11-04T09:30:01+09:00",
    "severity": "major",
    "x": 12.5,
    "y": 4.2,
    "objectId": "track-17",
    "objectType": "person",
    "eventId": "evt-20261104-000123"
  }'
# {"status":"created","alarmId":"..."}
```

### 이벤트 (좌표 없음, 심각도 생략)

```bash
curl -sS -X POST "$DT_URL/api/ingest/events" \
  -H "Authorization: Bearer $DT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "sensor-2f-door",
    "eventType": "door_forced",
    "occurredAt": "2026-11-04T00:31:00Z"
  }'
```

좌표가 없으므로 장치의 위치에 표시되고, 심각도는 연동 키의 기본값(초기 `critical`)이 된다.

### 시험용 도구

설정을 마치기 전에 흐름을 확인하려면 시뮬레이터를 쓴다. `pnpm sim seed`가 샘플 현장과 연동 키를 만들고, `pnpm sim run`이 위 두 창구로 메시지를 보낸다. 자세한 사용법은 [README](../README.ko.md)를 본다.

## 9. OpenAPI 문서

서버가 켜져 있으면 `/api/docs`(예: `http://localhost:8080/api/docs`)에서 모든 경로의 요청·응답 스키마를 보고 시험해 볼 수 있다. 이 문서의 표와 스키마가 다르면 `/api/docs`가 기준이다.

## 10. 연동 체크리스트

- [ ] 연동 키를 발급하고 `Authorization: Bearer dtk_...`로 보낸다.
- [ ] 장치를 dt에 먼저 등록하고, 그 장치 ID로 보낸다.
- [ ] 시각에 시간대를 포함한다(`Z` 또는 `+09:00`).
- [ ] 추적 중인 객체는 최소 1초에 한 번 보낸다. 객체마다 고유한 `objectId`를 쓴다.
- [ ] 이벤트에는 가능하면 `eventId`를 붙여 재전송에 대비한다.
- [ ] 좌표는 `x = 모델 X`, `y = -모델 Z`(m)이다. 화면의 좌표 표시로 확인한다.
- [ ] 위치는 한 요청에 1000건, 1 MiB 이하로 묶는다.
