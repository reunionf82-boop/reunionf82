# PowerShell 실행 정책 오류 해결 방법

## 문제
```
이 시스템에서 스크립트를 실행할 수 없으므로 ... 파일을 로드할 수 없습니다.
```

## 해결 방법

### 방법 1: 현재 세션에서만 실행 정책 변경 (권장)

1. **PowerShell을 관리자 권한으로 실행**
   - Windows 키 누르기
   - "PowerShell" 입력
   - "Windows PowerShell" 우클릭 → "관리자 권한으로 실행"

2. **프로젝트 폴더로 이동**
   ```powershell
   cd C:\Users\goric\reunionf82
   ```

3. **실행 정책 변경**
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
   ```

4. **스크립트 실행**
   ```powershell
   .\scripts\migrate-supabase.ps1 -OldProjectRef "jjcnrrbqqjciwqrxgedh" -NewProjectRef "tokazaacpwiqwzgoqpmf"
   ```

### 방법 2: 명령어를 한 줄로 실행

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\migrate-supabase.ps1 -OldProjectRef "jjcnrrbqqjciwqrxgedh" -NewProjectRef "tokazaacpwiqwzgoqpmf"
```

### 방법 3: cmd.exe에서 PowerShell 명령 실행

```cmd
powershell -ExecutionPolicy Bypass -Command "& {cd C:\Users\goric\reunionf82; .\scripts\migrate-supabase.ps1 -OldProjectRef 'jjcnrrbqqjciwqrxgedh' -NewProjectRef 'tokazaacpwiqwzgoqpmf'}"
```

## ⚠️ 주의사항

- `-Scope Process`는 현재 PowerShell 세션에서만 적용됩니다
- 다른 PowerShell 창을 열면 다시 설정해야 합니다
- 시스템 전체 설정을 변경하려면 관리자 권한이 필요합니다

## 빠른 해결 (복사해서 실행)

**PowerShell에서 실행:**
```powershell
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process; .\scripts\migrate-supabase.ps1 -OldProjectRef "jjcnrrbqqjciwqrxgedh" -NewProjectRef "tokazaacpwiqwzgoqpmf"
```

**cmd.exe에서 실행:**
```cmd
powershell -ExecutionPolicy Bypass -File .\scripts\migrate-supabase.ps1 -OldProjectRef "jjcnrrbqqjciwqrxgedh" -NewProjectRef "tokazaacpwiqwzgoqpmf"
```









