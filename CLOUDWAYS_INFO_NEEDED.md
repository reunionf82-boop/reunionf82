# Cloudways 설정에 필요한 정보

Cloudways 설정을 위해 다음 정보를 Cloudways 대시보드에서 확인하세요:

---

## 1. Application URL (필수)

**위치**: Cloudways → 해당 Application → **[Access Details]**

**예시**:
- `phpstack-1234.cloudwaysapps.com`
- 또는 `[서버 IP]`

**용도**: Vercel 환경 변수 `NEXT_PUBLIC_CLOUDWAYS_URL`에 입력

---

## 2. SFTP 접속 정보 (FileZilla용)

**위치**: Cloudways → 해당 Application → **[Access Details]** → **[SFTP/SSH]** 탭

**필요한 정보**:
- **Host**: `[서버 IP 주소]`
- **Username**: `[사용자명]`
- **Password**: `[비밀번호]`
- **Port**: `22`

**용도**: FileZilla로 파일 업로드

---

## 3. SSH 접속 정보 (터미널용)

**위치**: Cloudways → 해당 Application → **[Access Details]** → **[Master Credentials]**

**필요한 정보**:
- **User**: `[사용자명]`
- **Password**: `[비밀번호]`

**용도**: SSH 터미널에서 명령어 실행 (`npm install`, `pm2 start` 등)

---

## 4. Gemini API Key (필수)

**위치**: Google AI Studio (https://aistudio.google.com/)

**필요한 정보**:
- **API Key**: `[Gemini API 키]`

**용도**: Cloudways 서버의 `.env` 파일에 입력

---

## 5. 포트 정보

**기본 포트**: `3000`

**확인 방법**:
- SSH 터미널에서: `netstat -tulpn | grep 3000`
- 또는 Cloudways 방화벽 설정에서 포트 3000이 열려있는지 확인

---

## 📋 체크리스트

설정 전에 다음 정보를 모두 확인하세요:

- [ ] Application URL 확인
- [ ] SFTP 접속 정보 확인 (Host, Username, Password)
- [ ] SSH 접속 정보 확인 (User, Password)
- [ ] Gemini API Key 준비
- [ ] 포트 3000 접근 가능 여부 확인

---

## 💡 팁

### Application URL 확인 방법
1. Cloudways 로그인
2. **[Applications]** 클릭
3. 생성한 애플리케이션 클릭
4. **[Access Details]** 메뉴 클릭
5. **Application URL** 확인

### 포트 3000 접속 테스트
SSH 터미널에서 서버를 시작한 후:
```bash
curl http://localhost:3000/health
```

응답이 `{"status":"ok",...}` 이면 정상입니다.
