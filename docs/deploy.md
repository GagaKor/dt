# 배포 가이드

dt는 Docker 이미지 하나(화면 정적 파일 + API 서버)와 PostgreSQL로 이루어진다. 메시지 큐나 캐시 서버는 없다. 서버는 **한 대, 인스턴스 하나**로 돌리는 것을 전제로 한다.

## 1. 환경변수

`.env.example`을 `.env`로 복사해서 쓴다. 서버가 시작할 때 검증하며, 잘못된 값이 있으면 이유를 출력하고 종료한다.

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `8080` | 서버 포트. compose에서는 호스트에 공개하는 포트이고, 컨테이너 안의 앱은 항상 `8080`을 쓴다 |
| `HOST` | `0.0.0.0` | 바인드 주소 |
| `LOG_LEVEL` | `info` | 로그 레벨 |
| `DB_DRIVER` | `pg` | `pg`(PostgreSQL) 또는 `pglite`(내장 DB, 개발용). `.env.example`은 개발 편의로 `pglite`이고, compose가 `pg`로 덮어쓴다 |
| `DATABASE_URL` | 없음 | `DB_DRIVER=pg`일 때 필수. 예: `postgres://dt:dt@db:5432/dt` |
| `PGLITE_DIR` | 없음 | `pglite`의 데이터 디렉터리 |
| `STORAGE_DRIVER` | `local` | `local`(로컬 디스크) 또는 `s3`(S3 호환 저장소) |
| `STORAGE_LOCAL_DIR` | `./data/storage` | `local`일 때 모델 파일 위치. compose는 `/data/storage` 볼륨을 쓴다 |
| `S3_ENDPOINT` | 없음 | `s3`일 때 엔드포인트. AWS S3는 비워 둔다 |
| `S3_REGION` | `us-east-1` | 리전 |
| `S3_BUCKET` | 없음 | 버킷 이름(미리 만들어 둔다) |
| `S3_ACCESS_KEY_ID` | 없음 | 액세스 키 |
| `S3_SECRET_ACCESS_KEY` | 없음 | 시크릿 키 |
| `S3_FORCE_PATH_STYLE` | 없음 | `true`면 path-style 주소를 쓴다. MinIO 같은 자체 호스팅 서비스는 대개 `true`, AWS S3는 `false` |
| `ADMIN_USERNAME` | `admin` | 관리자 아이디 |
| `ADMIN_PASSWORD` | 없음(필수) | 관리자 비밀번호. 8자 이상 |
| `SESSION_SECRET` | 없음(필수) | 세션 서명 비밀값. 32자 이상. `openssl rand -base64 48` 같은 무작위 값 |
| `MAX_MODEL_MB` | `500` | 모델 업로드 최대 크기(MB) |
| `MIGRATIONS_DIR` | 없음 | 마이그레이션 폴더. Docker 이미지가 `/app/drizzle`로 설정한다 |
| `WEB_DIST_DIR` | 없음 | 서빙할 화면 빌드 폴더. Docker 이미지가 `/app/web`으로 설정한다 |

빈 문자열로 둔 선택 변수는 설정하지 않은 것으로 본다.

비밀값(`ADMIN_PASSWORD`, `SESSION_SECRET`, `S3_SECRET_ACCESS_KEY`)은 `.env`에만 두고 커밋하지 않는다. `.env`는 `.gitignore`에 들어 있다.

`.env.example`의 `ADMIN_PASSWORD`, `SESSION_SECRET`은 일부러 비워 두었다. 비어 있거나 예전 `.env.example`의 예시 값이면 서버가 변수 이름을 알려 주고 시작하지 않는다. 예시 값은 공개돼 있어서 그대로 쓰면 누구나 관리자 세션 쿠키를 위조할 수 있기 때문이다.

## 2. 온프레미스 (Docker Compose)

```bash
cp .env.example .env
# ADMIN_PASSWORD, SESSION_SECRET을 정한다. 비밀값 만들기: openssl rand -base64 48
docker compose up -d
```

`http://<서버>:8080`(`.env`의 `PORT`를 바꿨다면 그 포트)으로 접속한다. compose는 앱과 PostgreSQL 17을 띄우고, 앱은 시작할 때 마이그레이션을 적용한다. 데이터는 이름 있는 볼륨에 저장된다.

| 볼륨 | 내용 |
|---|---|
| `dt-db` | PostgreSQL 데이터 |
| `dt-storage` | 모델 파일(로컬 디스크 저장소일 때) |
| `dt-minio` | MinIO 데이터(`s3` 프로필일 때) |

### 저장소 선택

- **로컬 디스크(기본):** 추가 설정이 없다. 모델 파일이 `dt-storage` 볼륨에 저장된다.
- **S3 호환 저장소:** `.env`에서 `STORAGE_DRIVER=s3`와 `S3_*`를 설정한다. 이미 운영 중인 S3 호환 서비스가 있으면 그것을 가리키면 된다.

시험용으로 MinIO를 같이 띄우는 `s3` 프로필이 있다.

```bash
docker compose --profile s3 up -d
```

`.env`에 다음을 넣고 앱을 다시 띄운다. 버킷 `dt-data`는 `minio-init` 컨테이너가 만든다. MinIO 포트(`9000`, 콘솔 `9001`)는 `127.0.0.1`에만 열리므로 같은 PC에서만 접속된다. 앱은 compose 내부 네트워크로 `minio:9000`에 접속한다.

```
STORAGE_DRIVER=s3
S3_ENDPOINT=http://minio:9000
S3_REGION=us-east-1
S3_BUCKET=dt-data
S3_ACCESS_KEY_ID=dtminio
S3_SECRET_ACCESS_KEY=dtminio-secret
S3_FORCE_PATH_STYLE=true
```

> 주의: compose의 MinIO는 `bitnamilegacy/minio` 이미지(태그 `2025.5.24-debian-12-r5`로 고정)를 쓰며 **로컬 시험용**이다. 업스트림 `minio/minio` 이미지는 Docker Hub에 더 이상 게시되지 않아서 서버와 `mc` 클라이언트가 함께 들어 있는 이 이미지를 골랐다. 이 이미지는 더 이상 갱신되지 않고 계정 정보도 예시 값이므로 운영에 쓰지 않는다. 운영에서는 `S3_*`를 관리되는 S3 호환 서비스에 연결한다.

### 업데이트

```bash
git pull
docker compose build
docker compose up -d
```

마이그레이션은 앱이 시작할 때 자동으로 적용된다. 업데이트 전에 백업을 받아 둔다(5장).

### 앞단 프록시와 HTTPS

dt는 HTTP만 낸다. HTTPS가 필요하면 앞에 리버스 프록시(nginx, Caddy 등)를 둔다. 실시간 화면이 WebSocket(`/api/ws`)을 쓰므로 프록시가 `Upgrade` 헤더를 전달해야 한다. 서버가 25초마다 ping을 보내므로 프록시의 유휴 시간 제한(nginx `proxy_read_timeout` 기본 60초)은 그대로 둬도 된다. 화면은 60초 동안 아무 메시지도 받지 못하면 연결이 끊긴 것으로 보고 다시 연결한다. 모델 업로드가 크므로 프록시의 요청 본문 한도도 `MAX_MODEL_MB` 이상으로 올린다.

## 3. 클라우드

- **데이터베이스:** 관리형 PostgreSQL(RDS, Cloud SQL 등)을 쓰고 `DB_DRIVER=pg`, `DATABASE_URL=postgres://...`로 연결한다. 연결에 TLS가 필요하면 서비스가 안내하는 연결 문자열 옵션을 붙인다. compose의 `db` 서비스는 쓰지 않는다.
- **저장소:** 모델 파일은 로컬 디스크 대신 객체 저장소에 두는 편이 낫다. 컨테이너가 교체돼도 파일이 유지된다.
  - **AWS S3:** `S3_ENDPOINT`를 비우고 `S3_REGION`, `S3_BUCKET`, 키를 설정한다. `S3_FORCE_PATH_STYLE=false`.
  - **GCS:** 버킷에 HMAC 키를 만들고 상호운용(interoperability) 엔드포인트 `https://storage.googleapis.com`을 `S3_ENDPOINT`로 쓴다. 키는 HMAC 액세스 키와 시크릿이다.
  - **그 밖의 S3 호환 서비스:** 서비스의 엔드포인트를 쓰고, 필요하면 `S3_FORCE_PATH_STYLE=true`로 한다.
- **컨테이너 실행:** 이미지 하나를 한 인스턴스만 실행한다(6장 제한). 헬스체크는 `GET /api/health`다.
- `SESSION_SECRET`, `ADMIN_PASSWORD`, S3 키는 플랫폼의 비밀 관리 기능으로 주입한다.

## 4. 폐쇄망

- **런타임에 외부 네트워크를 호출하지 않는다.** CDN, 웹폰트, 원격 디코더를 쓰지 않는다. 폰트는 시스템 폰트이고 Meshopt 디코더는 번들에 들어 있다. 화면 사용자 PC도 인터넷이 필요 없다.
- **이미지 빌드는 레지스트리 접근이 한 번 필요하다.** `docker compose build`가 `node:24-bookworm-slim` 이미지와 npm 패키지(pnpm)를 받는다. 폐쇄망에서는 다음 중 하나로 해결한다.
  - 인터넷이 되는 곳에서 이미지를 빌드해서 `docker save` / `docker load`로 옮긴다.
  - 내부 레지스트리와 npm 미러를 두고 빌드한다. 이때 `postgres:17`, `node:24-bookworm-slim` 이미지도 내부 레지스트리로 미러링한다.
- 시험용 `s3` 프로필의 이미지(`bitnamilegacy/minio`)도 같은 방식으로 옮겨야 한다. 폐쇄망 운영에서는 내부 S3 호환 저장소나 로컬 디스크를 쓴다.
- 연동 시스템과 화면 사용자가 서버의 `8080`(또는 프록시)에 닿을 수 있어야 한다.
- 서버 시계가 맞아야 한다. 5분 넘게 미래인 시각은 거부하므로(연동 가이드) 장치와 서버 모두 NTP나 내부 시각 서버로 맞춘다.

## 5. 백업

백업 대상은 두 가지다.

| 대상 | 방법 |
|---|---|
| PostgreSQL | `pg_dump`. compose 예: `docker compose exec db pg_dump -U dt dt > dt-backup.sql` |
| 모델 파일 저장소 | 로컬 디스크는 `dt-storage` 볼륨, S3 호환은 버킷(버전 관리나 복제 기능) |

복구는 DB를 되돌린 뒤 같은 시점의 저장소를 되돌린다. DB의 현장 정보가 가리키는 모델 파일이 저장소에 있어야 한다. 객체 위치는 서버 메모리에만 있어서 백업 대상이 아니다.

## 6. 규모와 제한

### 목표 규모

서버 한 대 기준 목표는 현장 10개, 현장당 장치 200개, 한 현장에 동시에 보이는 객체 300개, 위치 메시지 초당 500건, 이벤트 메시지 초당 20건이다.

### 측정 결과

개발용 노트북에서 시뮬레이터(`pnpm sim load`)로 위치 500건/초와 이벤트 20건/초를 보냈을 때 서버 응답 지연의 p95는 위치 약 6 ms, 이벤트 약 14 ms였다.

화면은 객체 300개에서 소프트웨어 렌더링(GPU 없음) 기준 약 31 fps였다. 실제 GPU에서는 더 높을 것으로 보지만, **목표 하드웨어에서 직접 재야 한다.** 모니터링 주소 끝에 `?fps=1`을 붙이면 프레임 수가 표시된다.

위 수치는 한 대의 개발 노트북에서 잰 값이므로 참고용이다. 운영 환경에서 `pnpm sim load --url <주소>`로 다시 확인한다.

### 데이터 보존

v1은 이벤트와 알람을 **지우지 않고 계속 쌓는다.** 자동 정리 기능은 없다.

- 이벤트 메시지 하나가 `events` 테이블에 한 행으로 남는다. 초당 20건이면 하루에 약 170만 행(20 × 86,400 = 1,728,000)이다.
- `alarms`는 이어지는 이벤트를 한 행으로 묶으므로 대개 훨씬 적게 늘지만, 묶이지 않는 이벤트가 많으면 같은 속도로 는다.
- 대시보드 통계와 알람 목록은 `alarms`에서 계산한다. `events`는 `eventId` 중복 제거에만 쓰므로 오래된 행을 지워도 화면은 바뀌지 않는다. 다만 지운 기간의 `eventId`가 다시 오면 새 이벤트로 처리된다.

디스크 사용량을 보고 필요하면 주기적으로(예: cron) 정리한다. 아래는 90일보다 오래된 이벤트를 지우는 예다. `90`을 원하는 보관 일수로 바꾼다.

```bash
docker compose exec -T db psql -U dt dt -c \
  "DELETE FROM events WHERE occurred_at < now() - interval '90 days';"
```

통계에 쓰이는 알람까지 줄여야 하면, 확인된 오래된 알람을 지운다. 그 알람의 이벤트도 함께 지워지고(`ON DELETE CASCADE`), 그 기간의 통계도 사라진다.

```sql
DELETE FROM alarms
WHERE acknowledged_at IS NOT NULL
  AND last_occurred_at < now() - interval '365 days';
```

`events`의 시각 컬럼에는 인덱스가 없어서 테이블이 크면 삭제가 오래 걸린다. 사용이 적은 시간에 돌린다. 지운 공간은 PostgreSQL의 autovacuum이 다시 쓴다.

### 알려진 제한

- **서버 인스턴스는 하나다.** 객체 위치와 실시간 전달이 서버 메모리에 있어서 여러 대로 늘릴 수 없다.
- **위치는 저장하지 않는다.** 최신 위치만 4초 동안 메모리에 둔다. v1에는 이력 재생이 없다.
- 장치 온라인 상태 감시는 없다.
- 관리자 계정은 하나다.
- 알람 상태는 미확인 / 확인 두 단계다.
- 이벤트와 알람을 자동으로 지우지 않는다(위 '데이터 보존').
