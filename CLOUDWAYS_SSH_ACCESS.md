# Cloudways SSH 접속 방법

Cloudways에서 SSH 터미널 메뉴가 없는 경우, 외부 SSH 클라이언트를 사용하세요.

---

## 방법 1: Windows PowerShell 또는 CMD 사용 (가장 간단)

### 1단계: SSH 접속 정보 확인

1. Cloudways → 해당 Application → **[Access Details]** 클릭
2. **[Master Credentials]** 또는 **[SFTP/SSH]** 탭에서 확인:
   - **Host/IP**: `[서버 IP 주소]`
   - **Username**: `[사용자명]`
   - **Password**: `[비밀번호]`
   - **Port**: `22` (기본값)

### 2단계: Windows에서 SSH 접속

**PowerShell 또는 CMD**를 열고:

```bash
ssh [사용자명]@[서버 IP]
```

예시:
```bash
ssh master@123.45.67.89
```

- 비밀번호 입력 시 화면에 아무것도 안 보이는 게 정상입니다 (입력 후 Enter)
- 첫 접속 시 "Are you sure you want to continue connecting?" → `yes` 입력

### 3단계: public_html 폴더로 이동

```bash
cd public_html
```

---

## 방법 2: PuTTY 사용 (Windows)

### 1단계: PuTTY 다운로드
- https://www.putty.org/ 에서 다운로드

### 2단계: PuTTY 설정
1. PuTTY 실행
2. **Host Name (or IP address)**: `[서버 IP]`
3. **Port**: `22`
4. **Connection type**: `SSH` 선택
5. **[Open]** 클릭

### 3단계: 로그인
- Username: `[사용자명]` 입력
- Password: `[비밀번호]` 입력 (화면에 안 보이는 게 정상)

### 4단계: public_html 폴더로 이동
```bash
cd public_html
```

---

## 방법 3: Windows Terminal 사용

1. **Windows Terminal** 실행 (Windows 10/11 기본 제공)
2. 상단 **+** 버튼 옆 **▼** 클릭 → **명령 프롬프트** 또는 **PowerShell** 선택
3. SSH 명령어 입력:
```bash
ssh [사용자명]@[서버 IP]
```

---

## 방법 4: Cloudways 대시보드에서 직접 찾기

Cloudways UI가 업데이트되어 메뉴 위치가 다를 수 있습니다:

1. **Applications** → 해당 Application 클릭
2. 왼쪽 메뉴에서 다음 중 하나 찾기:
   - **SSH Terminal**
   - **Terminal**
   - **Console**
   - **Access Details** → 하단에 **SSH** 버튼
   - **Settings** → **SSH Access**

3. 또는 상단 메뉴에서:
   - **Server Management** → **SSH Terminal**
   - **Tools** → **SSH Terminal**

---

## 접속 후 명령어 실행

SSH 접속이 성공하면 다음 명령어를 순서대로 실행:

```bash
# 1. public_html 폴더로 이동
cd public_html

# 2. 현재 위치 확인
pwd
ls -la

# 3. Node.js 버전 확인
node --version
npm --version

# 4. Node.js가 없거나 버전이 낮으면 설치
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18

# 5. 패키지 설치
npm install

# 6. 서버 테스트 실행
node cloudways-server.js

# 7. 정상 작동 확인 후 Ctrl+C로 중지

# 8. PM2로 백그라운드 실행 (권장)
npm install -g pm2
pm2 start cloudways-server.js --name ai-backend
pm2 save
pm2 startup
```

---

## 문제 해결

### "ssh: command not found" 오류
- Windows 10/11: PowerShell 또는 CMD에서 `ssh` 명령어 사용 가능
- Windows 7/8: PuTTY 사용 권장

### "Permission denied" 오류
- 비밀번호를 잘못 입력했을 수 있습니다
- Cloudways의 Master Credentials를 다시 확인하세요

### "Connection refused" 오류
- 서버 IP 주소를 확인하세요
- 포트 22가 열려있는지 확인하세요
- Cloudways 방화벽 설정 확인

---

## 빠른 체크리스트

- [ ] Cloudways에서 SSH 접속 정보 확인 (Host, Username, Password)
- [ ] Windows PowerShell/CMD 또는 PuTTY로 SSH 접속 성공
- [ ] `cd public_html` 명령어로 폴더 이동 성공
- [ ] `ls -la` 명령어로 파일 확인 (cloudways-server.js, package.json, .env)
- [ ] Node.js 버전 확인 (18 이상)
- [ ] `npm install` 실행 성공

---

## 💡 팁

### SSH 접속 정보 저장 (Windows)
PowerShell에서:
```powershell
# SSH config 파일 생성/편집
notepad $HOME\.ssh\config
```

다음 내용 추가:
```
Host cloudways
    HostName [서버 IP]
    User [사용자명]
    Port 22
```

이후 `ssh cloudways`로 간단히 접속 가능

---

## 다음 단계

SSH 접속이 성공하고 `npm install`까지 완료되면:
1. 서버 시작 테스트
2. 헬스 체크
3. Vercel 환경 변수 설정
