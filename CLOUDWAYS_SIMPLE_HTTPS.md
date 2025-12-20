# Cloudways HTTPS 설정 - 가장 간단한 방법

## 문제
HTTPS 페이지에서 HTTP 서버 접근 시 브라우저가 차단합니다.

## 해결: Cloudways Application URL 사용

Cloudways Application URL은 이미 HTTPS를 지원합니다. 포트 3000을 Application URL로 노출하면 됩니다.

---

## 방법 1: Cloudways 대시보드에서 SSL 설정 (가장 간단)

1. **Cloudways → 해당 Application → [SSL Certificate]**
2. **Let's Encrypt** 선택
3. 도메인 입력 (또는 Application URL 사용)
4. **Install Certificate** 클릭

이제 `https://[Application URL]`로 접근 가능합니다.

---

## 방법 2: Nginx 설정 (5분 소요)

### SSH 터미널에서:

```bash
# 1. Nginx 설정 파일 찾기
sudo find /etc/nginx -name "*.conf" | grep -i cloudways
# 또는
sudo ls -la /etc/nginx/sites-available/
sudo ls -la /etc/nginx/conf.d/
```

### 설정 파일 편집:

```bash
# 파일 열기 (파일명은 다를 수 있음)
sudo nano /etc/nginx/sites-available/[파일명]
```

### 파일 끝에 추가:

```nginx
location /chat {
    proxy_pass http://localhost:3000/chat;
    proxy_read_timeout 1800s;
}

location /health {
    proxy_pass http://localhost:3000/health;
}
```

### 저장 후:

```bash
# 설정 테스트
sudo nginx -t

# 재시작
sudo systemctl restart nginx
```

---

## Vercel 환경 변수 설정

- `NEXT_PUBLIC_CLOUDWAYS_URL`: `https://phpstack-1342840-6086717.cloudwaysapps.com`

---

## 완료!

이제 `https://[Application URL]/chat`로 접근하면 됩니다.
