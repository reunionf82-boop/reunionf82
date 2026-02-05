# Cloudways Vertex Live 프록시 점검 체크리스트

Vercel 배포·환경변수는 맞는데 실서버에서 Live가 끊길 때(code=1008), Cloudways 프록시 서버에서 아래를 순서대로 확인하세요.

---

## 1. Cloudways에서 같은 GCP 프로젝트·키 쓰는지 확인

### 1-1. Cloudways SSH 접속

- Cloudways 대시보드 → 해당 서버 선택 → **SSH Terminal** 또는 **Application** → **Access Details** 에서 SSH 정보 확인.
- 로컬 터미널에서:
  ```bash
  ssh master@<Cloudways서버IP>
  ```
  (비밀번호 또는 키로 로그인)

### 1-2. 프록시 프로세스가 읽는 환경변수 확인

프록시는 **pm2**로 띄운 경우, pm2가 설정한 환경변수를 씁니다.  
다음 중 하나로 확인합니다.

**방법 A: pm2 env에서 확인**

```bash
pm2 show vertex-live-proxy
```

출력에서 `env` 섹션을 봅니다.  
`GOOGLE_CLOUD_PROJECT`, `GOOGLE_APPLICATION_CREDENTIALS` 등이 있는지 확인합니다.

**방법 B: ecosystem 파일 사용 시**

```bash
cat /home/master/applications/<앱경로>/vertex-live-proxy-ecosystem.config.js
# 또는
pm2 prettylist | head -80
```

여기서 `env: { GOOGLE_CLOUD_PROJECT: '...', GOOGLE_APPLICATION_CREDENTIALS: '...' }` 같은 설정이 있는지 봅니다.

**확인할 값:**

| 변수명 | 로컬(참고) | Cloudways에서 기대값 |
|--------|-------------|----------------------|
| `GOOGLE_CLOUD_PROJECT` | `gen-lang-client-0216392289` | **동일** `gen-lang-client-0216392289` |
| `GOOGLE_APPLICATION_CREDENTIALS` | `C:\Users\goric\.secrets\gen-lang-client-0216392289-8c81c361bd21.json` | **서버 내 JSON 키 파일의 절대 경로** (아래 1-3 참고) |

- 프로젝트 ID가 다르면 1008(Publisher Model)이 날 수 있습니다. **반드시 같은 프로젝트**를 쓰도록 맞춥니다.

### 1-3. 서버에 GCP 서비스 계정 키 파일이 있는지

- 로컬에서 쓰는 것과 **같은 프로젝트**의 서비스 계정 JSON 키를 Cloudways 서버 어딘가에 업로드해 두어야 합니다.
- 예: `/home/master/.secrets/gen-lang-client-0216392289-8c81c361bd21.json`
- 파일이 있다면:
  ```bash
  ls -la /home/master/.secrets/gen-lang-client-0216392289-8c81c361bd21.json
  cat /home/master/.secrets/gen-lang-client-0216392289-8c81c361bd21.json | head -5
  ```
  - `"project_id": "gen-lang-client-0216392289"` 인지 확인.
- 없다면:
  - GCP 콘솔에서 해당 프로젝트의 서비스 계정 키(JSON)를 다시 받아, **동일한 프로젝트** 키를 서버에 업로드하고
  - `GOOGLE_APPLICATION_CREDENTIALS`를 그 **절대 경로**로 설정합니다.

### 1-4. pm2에 환경변수 넘기는 방법 (설정이 없거나 다를 때)

**옵션 1: ecosystem 파일 사용 (권장)**

프록시 앱 루트에 `ecosystem.config.js` (또는 `.cjs`) 파일을 만듭니다.

```javascript
module.exports = {
  apps: [{
    name: 'vertex-live-proxy',
    script: './scripts/vertex-live-proxy-server.js',
    cwd: '/home/master/applications/xxxxx/public_html',  // 실제 앱 경로로 변경
    env: {
      GOOGLE_CLOUD_PROJECT: 'gen-lang-client-0216392289',
      GOOGLE_CLOUD_LOCATION: 'asia-northeast3',
      GOOGLE_APPLICATION_CREDENTIALS: '/home/master/.secrets/gen-lang-client-0216392289-8c81c361bd21.json',
    },
  }],
}
```

그다음:

```bash
cd /home/master/applications/xxxxx/public_html
pm2 delete vertex-live-proxy   # 기존 프로세스 제거
pm2 start ecosystem.config.js
pm2 save
```

**옵션 2: export 후 pm2 start**

```bash
export GOOGLE_CLOUD_PROJECT=gen-lang-client-0216392289
export GOOGLE_CLOUD_LOCATION=asia-northeast3
export GOOGLE_APPLICATION_CREDENTIALS=/home/master/.secrets/gen-lang-client-0216392289-8c81c361bd21.json
cd /home/master/applications/xxxxx/public_html
pm2 start scripts/vertex-live-proxy-server.js --name vertex-live-proxy
pm2 save
```

- `export`는 **현재 SSH 세션에만** 적용됩니다. 재부팅/재로그인 후에는 ecosystem으로 관리하는 편이 안전합니다.

---

## 2. 프록시가 쓰는 리전 확인 및 us-central1 테스트

- 프록시는 `GOOGLE_CLOUD_LOCATION`을 기본값으로 쓰고, 클라이언트가 `init.region`을 보내면 그 리전으로 연결합니다.
- **asia-northeast3**에서 1008이 나오면, 같은 프로젝트에서 **us-central1**은 되는지 먼저 테스트하는 것이 좋습니다.

### 2-1. 서버 기본 리전만 바꿔서 테스트 (클라이언트가 region 안 보낼 때)

Cloudways에서:

```bash
# 환경변수만 바꿔서 재시작 (임시 테스트)
export GOOGLE_CLOUD_LOCATION=us-central1
pm2 restart vertex-live-proxy
# 또는 ecosystem 파일에서 GOOGLE_CLOUD_LOCATION 을 us-central1 로 바꾼 뒤
pm2 restart vertex-live-proxy
```

그다음 앱에서 음성 MVP를 다시 시도해 봅니다.

### 2-2. 클라이언트가 region을 보내는 경우

클라이언트 코드에서 `init` 시 `region: 'asia-northeast3'` 를 보내고 있다면, **서버 기본값만 바꿔도 클라이언트가 asia-northeast3를 계속 요청**합니다.  
그럴 때는:

- **방법 A**: 클라이언트에서 기본 리전을 `us-central1`로 바꾸거나,
- **방법 B**: 서버에서 `GOOGLE_CLOUD_LOCATION=us-central1` 로 두고, 클라이언트가 region을 안 보내면 서버 기본값(us-central1)이 사용됩니다.

우선 **서버만 us-central1로 바꾼 뒤** 로그를 보고,  
로그에 `region=us-central1` 이 나오는지 확인한 다음,  
여전히 1008이면 클라이언트가 보내는 `region` 값도 확인합니다.

### 2-3. GCP 콘솔에서 모델/리전 확인 (선택)

- [Google Cloud Console](https://console.cloud.google.com/) → 프로젝트 `gen-lang-client-0216392289` 선택.
- **Vertex AI** → **모델 정책 / 할당량** 또는 **Generative AI** 문서에서  
  `gemini-live-2.5-flash-native-audio` (또는 사용 중인 Live 모델)이  
  **asia-northeast3** vs **us-central1** 중 어디서 지원되는지 확인합니다.
- asia-northeast3가 안 되면, 프록시(및 필요 시 클라이언트)를 **us-central1**로 맞추면 됩니다.

---

## 3. 재시작 후 로그로 1008 여부 확인

### 3-1. 재시작

```bash
pm2 restart vertex-live-proxy
```

### 3-2. 로그 보기 (실시간)

```bash
pm2 logs vertex-live-proxy --lines 30
```

- 한 번 연결 시도한 뒤 로그에서 다음을 확인합니다.
  - `init model=gemini-live-2.5-flash-native-audio region=???`  
    → **region**이 의도한 값(asia-northeast3 또는 us-central1)인지.
  - `Vertex connect OK`  
    → Vertex까지 연결은 된 것.
  - `Vertex onclose code=1008 reason=...`  
    → 여전히 1008이면 **같은 프로젝트/리전/모델** 조합이 GCP 쪽에서 허용되지 않는 것이므로,  
      **리전을 us-central1로 바꾸거나**, **프로젝트/모델 권한·할당량**을 GCP에서 점검합니다.

### 3-3. 최근 로그만 파일로 저장해 두고 싶을 때

```bash
pm2 logs vertex-live-proxy --lines 80 --nostream > /tmp/vertex-live-logs.txt
cat /tmp/vertex-live-logs.txt
```

---

## 요약 체크리스트

- [ ] Cloudways SSH 접속 가능
- [ ] `GOOGLE_CLOUD_PROJECT=gen-lang-client-0216392289` (로컬과 동일)
- [ ] `GOOGLE_APPLICATION_CREDENTIALS` = 서버에 올린 **같은 프로젝트** JSON 키의 **절대 경로**
- [ ] JSON 키 파일 존재 및 `project_id` 일치
- [ ] asia-northeast3에서 1008이면 `GOOGLE_CLOUD_LOCATION=us-central1` 로 변경 후 재시작
- [ ] `pm2 restart vertex-live-proxy` 후 `pm2 logs vertex-live-proxy --lines 30` 으로 `region` 및 `code=1008` 여부 확인

이 순서대로 하시면, “배포·환경변수 맞는데 왜 안 되지?”의 원인이 **프록시의 GCP 프로젝트/키/리전** 쪽인지 바로 좁힐 수 있습니다.
