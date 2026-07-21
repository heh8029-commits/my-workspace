# 미리토퍼 사진 접수 · 조회 시스템 — 설치 및 배포 안내

기존 GitHub Pages 정적 사이트(`my-workspace`)에 **사진 접수/조회 기능**을 추가합니다.
민감한 처리(비밀번호 해시·Signed URL·관리자 인증·자동삭제)는 전부 **Supabase Edge Function(service_role)** 에서 수행하고,
프런트엔드(HTML)는 그 함수만 호출합니다. 정적 페이지에는 비밀 키를 두지 않습니다.

---

## 0. 구성도

```
[고객 브라우저] photo.html ─┐
[관리자 브라우저] photo-admin.html ─┤ (anon key 로 함수 호출)
                                    ▼
              Supabase Edge Functions (service_role)
              submit / lookup-search / lookup-verify / admin / cleanup
                                    ▼
        Postgres(photo_receipts, photo_files)  +  Storage(비공개 버킷)
                                    ▲
                     pg_cron (매시) → cleanup (3일 지난 사진 삭제)
```

- 사진 업로드: 함수가 **서명된 업로드 URL** 발급 → 브라우저가 직접 Storage 로 PUT(진행률 표시)
- 사진 조회: 함수가 **짧은 만료(90초) Signed URL** 발급 → 고정 공개 URL 없음
- 비밀번호: PBKDF2-SHA256 해시만 저장(평문 저장 안 함), 관리자도 원문 확인 불가
- 자동삭제: `delete_at`(접수완료+3일) 경과 시 Storage 파일 + DB 사진행 함께 삭제

---

## 1. 사전 준비

1. [supabase.com](https://supabase.com) 에서 무료 프로젝트 생성
2. Supabase CLI 설치 (Edge Function 배포용)
   ```bash
   npm install -g supabase        # 또는 scoop install supabase
   supabase --version
   ```
3. 프로젝트 정보 확인: **Project Settings → API**
   - `Project URL` (예: `https://abcdefgh.supabase.co`)
   - `anon public` 키 (프런트에 넣는 공개 키)
   - `service_role` 키 (절대 프런트에 넣지 말 것 — 함수 시크릿에만)
   - `Reference ID`(= PROJECT_REF)

---

## 2. 데이터베이스 · Storage · RLS · Cron 설정 (SQL Editor)

Supabase 대시보드 → **SQL Editor** 에서 `sql/` 파일을 순서대로 실행합니다.

| 순서 | 파일 | 내용 |
|---|---|---|
| 1 | `sql/01_schema.sql` | 테이블(`photo_receipts`, `photo_files`, `admin_users`, `admin_login_attempts`) |
| 2 | `sql/02_storage.sql` | **비공개** 버킷 `photo-receipts` 생성 |
| 3 | `sql/03_rls.sql` | 모든 테이블 RLS ON + anon 정책 0개(직접 접근 차단) |
| 4 | `sql/04_cron.sql` | 매시 자동삭제 스케줄 (※ `PROJECT_REF`, `CLEANUP_SECRET` 교체 후 실행) |

> `04_cron.sql` 은 4번(함수 배포 + 시크릿 설정)까지 끝난 뒤 실행하세요.

---

## 3. Edge Function 배포

### 3-1. CLI 로그인 & 링크
```bash
supabase login
supabase link --project-ref <PROJECT_REF>
```

### 3-2. 함수 폴더 배치
`photo-backend/functions/` 안의 폴더들을 supabase 프로젝트의 `supabase/functions/` 로 복사합니다.
(`_shared/` 폴더 포함 — 공용 모듈)

```
supabase/functions/
  _shared/{cors.ts, hash.ts, auth.ts, supabase.ts}
  submit/index.ts
  lookup-search/index.ts
  lookup-verify/index.ts
  admin/index.ts
  cleanup/index.ts
```

`photo-backend/supabase/config.toml` 의 `[functions.*] verify_jwt=false` 블록을 프로젝트 `supabase/config.toml` 에 병합하세요.

### 3-3. 시크릿(환경변수) 설정
```bash
supabase secrets set \
  ADMIN_TOKEN_SECRET="$(openssl rand -hex 32)" \
  ADMIN_BOOTSTRAP_SECRET="$(openssl rand -hex 16)" \
  CLEANUP_SECRET="$(openssl rand -hex 16)" \
  ALLOWED_ORIGINS="https://heh8029-commits.github.io"
```
> `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` 는 Supabase 가 **자동 주입**하므로 설정 불필요.
> `ALLOWED_ORIGINS` 는 실제 GitHub Pages 주소로 지정(콤마로 여러 개 가능). 로컬 테스트 시 `,http://localhost:5500` 등을 추가.

### 3-4. 배포
```bash
supabase functions deploy submit --no-verify-jwt
supabase functions deploy lookup-search --no-verify-jwt
supabase functions deploy lookup-verify --no-verify-jwt
supabase functions deploy admin --no-verify-jwt
supabase functions deploy cleanup --no-verify-jwt
```

---

## 4. 최초 관리자 계정 생성 (1회)

`ADMIN_BOOTSTRAP_SECRET` 값을 사용해 최초 관리자 1명을 만듭니다. (터미널에서)
```bash
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/admin" \
  -H "Content-Type: application/json" \
  -H "apikey: <ANON_KEY>" \
  -d '{"action":"bootstrap","secret":"<ADMIN_BOOTSTRAP_SECRET>","username":"admin","password":"8자리이상비번"}'
```
성공하면 `{"ok":true}`. 이후 bootstrap 은 계정이 있으면 거부됩니다(안전).

---

## 5. 자동삭제 스케줄 등록

`sql/04_cron.sql` 에서 `PROJECT_REF`, `CLEANUP_SECRET` 를 실제 값으로 바꾼 뒤 SQL Editor 에서 실행.
등록 확인: `select jobname, schedule, active from cron.job;`

---

## 6. 프런트엔드 설정 & GitHub Pages 배포

### 6-1. 설정 파일 수정
저장소 루트 `photo-config.js` 를 본인 값으로 교체:
```js
window.MIRITOPPER_CONFIG = {
  SUPABASE_URL: "https://<PROJECT_REF>.supabase.co",
  SUPABASE_ANON_KEY: "<ANON_KEY>",
};
```
> anon key 는 공개돼도 되는 키입니다(테이블 직접접근은 RLS 로 차단, 함수는 자체 인증).

### 6-2. 배포 (기존 사이트에 파일만 추가됨)
루트 원본에서는 push 가 막혀 있으므로(메모리 규칙) Temp 클론을 통해 push:
```bash
# 예시 흐름
git clone https://github.com/heh8029-commits/my-workspace.git  <temp>/my-workspace-clone
# photo.html, photo-admin.html, photo-config.js, photo-backend/ 를 클론으로 복사
cd <temp>/my-workspace-clone
git add photo.html photo-admin.html photo-config.js photo-backend
git commit -m "feat: 미리토퍼 사진 접수/조회 시스템 추가"
git push
```
GitHub Pages 가 활성화돼 있으므로 몇 분 뒤 접속 가능:
- 고객: `https://heh8029-commits.github.io/my-workspace/photo.html`
- 관리자: `https://heh8029-commits.github.io/my-workspace/photo-admin.html`

> 기존 `index.html`, `coupang.html` 등 다른 파일은 **전혀 건드리지 않으므로** 기존 기능에 영향 없음.

---

## 7. 환경변수 / 시크릿 요약

| 이름 | 위치 | 용도 |
|---|---|---|
| `SUPABASE_URL` | 함수(자동) | 프로젝트 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 함수(자동) | RLS 우회 관리 접근 |
| `SUPABASE_ANON_KEY` | 함수(자동) + `photo-config.js` | 공개 호출 키 |
| `ADMIN_TOKEN_SECRET` | 함수 시크릿 | 관리자 세션 토큰 서명(HMAC) |
| `ADMIN_BOOTSTRAP_SECRET` | 함수 시크릿 | 최초 관리자 생성 1회용 |
| `CLEANUP_SECRET` | 함수 시크릿 + cron SQL | cleanup 무단호출 차단 |
| `ALLOWED_ORIGINS` | 함수 시크릿 | CORS 허용 도메인 |

---

## 8. 배포 전 테스트 체크리스트

**접수**
- [ ] 쇼핑몰 미선택/이름 공란/전화 4자리 아님 → 제출 차단
- [ ] 비밀번호 4 또는 6자리만 통과, 확인값 불일치 시 차단
- [ ] 사진 6장째 첨부/20MB 초과/비허용 형식 → 거부 토스트
- [ ] 썸네일 미리보기·개별 삭제·드래그 순서변경·장수/용량 표시 동작
- [ ] 업로드 진행률 표시, 제출 중 버튼 비활성(중복 제출 방지)
- [ ] 접수 완료 화면에 이름/동/전화뒷4/장수/접수일시/삭제예정/접수번호 표시
- [ ] "접수한 사진 확인하기" → 바로 상세(본인 비번 보유) 표시

**조회**
- [ ] 이름 검색 결과에 사진 썸네일이 **안 보임**(개인정보), 항목만 표시
- [ ] 틀린 비밀번호 → 상세/사진 노출 안 됨, 남은 시도 안내
- [ ] 5회 실패 → 일정시간 잠금(429)
- [ ] 정상 비밀번호 → 상세 + 사진(짧은 만료 Signed URL) 표시, 남은 삭제시간 표시
- [ ] 사진 삭제된 접수 → "보관기간이 지나…자동 삭제" 메시지

**관리자**
- [ ] 잘못된 로그인 5회 → 잠금
- [ ] 이름/전화/동/쇼핑몰/기간/상태 검색 필터 동작
- [ ] 상태 변경(신규~출고) 반영
- [ ] 비밀번호 재설정 → 임시비번 발급, 그 비번으로 고객 조회 성공
- [ ] 사진 즉시 삭제 / 선택 일괄 삭제 → Storage·DB 함께 삭제 확인
- [ ] 3일 연장 → 삭제 예정일 갱신
- [ ] 원본 다운로드 동작

**보안/자동삭제**
- [ ] 버킷이 **비공개**(고정 URL 접근 불가) 확인
- [ ] anon key 로 테이블 직접 select 시도 → 거부(RLS)
- [ ] cleanup 수동 호출(잘못된 secret) → 403
- [ ] cleanup 정상 호출 → 만료 사진 삭제, `photos_deleted=true`
- [ ] pg_cron 잡 등록·활성 확인

---

## 9. 생성/수정 파일 목록

**신규(프런트, 저장소 루트)**
- `photo.html` — 고객 접수 + 조회 페이지
- `photo-admin.html` — 관리자 페이지
- `photo-config.js` — 프런트 공용 설정(Supabase URL/anon key)

**신규(백엔드, `photo-backend/`)**
- `sql/01_schema.sql`, `sql/02_storage.sql`, `sql/03_rls.sql`, `sql/04_cron.sql`
- `functions/_shared/{cors,hash,auth,supabase}.ts`
- `functions/submit/index.ts`
- `functions/lookup-search/index.ts`
- `functions/lookup-verify/index.ts`
- `functions/admin/index.ts`
- `functions/cleanup/index.ts`
- `supabase/config.toml` (verify_jwt 설정 병합용)
- `README.md` (이 문서)

**수정 없음:** 기존 `index.html`, `coupang.html`, `member.html`, `work.html`, `sw.js` 등은 변경하지 않았습니다.
