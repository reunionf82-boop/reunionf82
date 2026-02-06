# bin – 실행 파일

## ffmpeg (Linux)

M4A 변환(음성 다시듣기 iOS 대응)용으로 사용합니다.

1. Linux용 ffmpeg 정적 빌드를 다운로드합니다.
   - https://johnvansickle.com/ffmpeg/ (release: ffmpeg-release-amd64-static)
   - 또는 `apt install ffmpeg` 후 시스템 경로 사용 시 이 폴더에 둘 필요 없음
2. 압축 해제 후 실행 파일을 이 디렉터리에 넣습니다.
   - 파일명: `ffmpeg` (실행 권한: `chmod +x ffmpeg`)

배포 서버(Cloudways 등)에서는:
- 이 경로에 `ffmpeg`를 두거나
- 시스템에 ffmpeg를 설치한 뒤 `FFMPEG_PATH` 환경변수로 경로 지정 (예: `/usr/bin/ffmpeg`)

큰 바이너리는 Git에 넣지 않으려면 `.gitignore`에 다음을 추가하세요:
```
/bin/ffmpeg
```
