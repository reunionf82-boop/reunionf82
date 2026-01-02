# Cloudways npm 설치 가이드

## 문제

Node.js는 설치되어 있지만 `npm: command not found` 오류가 발생하는 경우

## 해결 방법

### 1. npm이 실제로 설치되어 있는지 확인

```bash
# npm 위치 확인
which npm

# 또는
whereis npm

# Node.js 경로 확인
which node
```

### 2. nvm으로 Node.js 재설치 (권장)

nvm을 사용하면 Node.js와 npm이 함께 설치됩니다.

```bash
# nvm 설치 (아직 안 된 경우)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# 쉘 재시작 또는 환경 변수 로드
source ~/.bashrc
# 또는
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Node.js 18 설치 (npm 포함)
nvm install 18
nvm use 18

# 설치 확인
node --version
npm --version
```

### 3. npm 직접 설치

Node.js가 이미 설치되어 있지만 npm만 없는 경우:

```bash
# Node.js 경로 확인
which node
# 예: /usr/bin/node 또는 /home/user/.nvm/versions/node/v18.20.4/bin/node

# npm 설치 스크립트 다운로드 및 실행
curl -L https://www.npmjs.com/install.sh | sh

# 또는 Node.js가 nvm으로 설치된 경우
# Node.js 재설치가 더 안전합니다
```

### 4. 시스템 Node.js 사용 (임시 해결)

시스템에 Node.js가 설치되어 있지만 nvm 버전을 사용하고 있는 경우:

```bash
# 시스템 Node.js 경로 확인
/usr/bin/node --version
/usr/bin/npm --version

# nvm 비활성화 (임시)
nvm deactivate

# npm 확인
npm --version

# 사용 후 다시 활성화
source ~/.bashrc
```

### 5. 수동으로 npm 설치

```bash
# npm 패키지 다운로드
curl -L https://registry.npmjs.org/npm/-/npm-10.2.4.tgz | tar xz

# 또는 특정 버전 설치
# Node.js 18.20.4에 맞는 npm 버전은 10.x입니다
```

## 가장 간단한 해결책

**nvm으로 Node.js 재설치** (npm 자동 포함):

```bash
# 1. nvm 설치 (없는 경우)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# 2. 환경 변수 로드
source ~/.bashrc

# 3. Node.js 18 재설치 (npm 포함)
nvm install 18 --reinstall-packages-from=18

# 또는 기존 버전 삭제 후 재설치
nvm uninstall 18
nvm install 18

# 4. 사용할 버전 선택
nvm use 18

# 5. 기본 버전으로 설정
nvm alias default 18

# 6. 확인
node --version
npm --version
```

## 확인

설치가 완료되면:

```bash
# 버전 확인
node --version
npm --version

# npm 경로 확인
which npm

# npm 작동 확인
npm --help
```

## 문제 해결

### nvm이 인식되지 않는 경우

```bash
# .bashrc에 nvm 추가 확인
cat ~/.bashrc | grep nvm

# 수동으로 환경 변수 설정
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

# 현재 쉘에서 실행
source ~/.bashrc
```

### 권한 오류가 발생하는 경우

```bash
# 홈 디렉토리에 nvm 설치 확인
ls -la ~/.nvm

# 권한 확인
ls -la ~/.nvm/versions/node/v18.*/bin/
```
