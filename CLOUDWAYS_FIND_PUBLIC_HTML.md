# Cloudways public_html 폴더 찾기

## 경로

Cloudways에서 `public_html` 폴더는 다음 경로에 있습니다:

```
/applications/[애플리케이션명]/public_html
```

## 찾는 방법

### 1. applications 폴더로 이동

```bash
cd /applications
ls -la
```

### 2. 애플리케이션 폴더 확인

애플리케이션 목록이 표시됩니다. 예:
```
drwxr-xr-x  5 user user 4096 Jan  2 06:00 phpstack-1569797-6109694
drwxr-xr-x  5 user user 4096 Jan  1 10:00 another-app
```

### 3. 애플리케이션 폴더로 이동

```bash
cd phpstack-1569797-6109694
# 또는 실제 애플리케이션 폴더명
```

### 4. public_html 폴더 확인

```bash
ls -la
# public_html 폴더가 보여야 함

cd public_html
pwd
# /applications/phpstack-1569797-6109694/public_html
```

## 빠른 방법

### 방법 1: find 명령어 사용

```bash
find /applications -name "public_html" -type d
```

### 방법 2: 직접 경로 확인

Cloudways 대시보드에서:
1. **Applications** → 애플리케이션 선택
2. **Access Details** → **Application Path** 확인

일반적으로:
- 애플리케이션 이름: `phpstack-1569797-6109694`
- 경로: `/applications/phpstack-1569797-6109694/public_html`

## 실제 사용 예시

```bash
# 현재 위치 확인
pwd
# / (루트 디렉토리)

# applications 폴더로 이동
cd /applications

# 애플리케이션 목록 확인
ls -la

# 애플리케이션 폴더로 이동 (실제 폴더명으로 변경)
cd phpstack-1569797-6109694

# public_html 확인
ls -la
# public_html 폴더가 보여야 함

# public_html로 이동
cd public_html

# 현재 위치 확인
pwd
# /applications/phpstack-1569797-6109694/public_html

# 파일 확인
ls -la
```
