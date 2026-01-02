#!/bin/bash
# 클라우드웨이즈 서버 메모리 상태 확인 스크립트

echo "=== 메모리 상태 확인 ==="
echo ""

echo "1. 전체 메모리 상태:"
free -h
echo ""

echo "2. 메모리를 많이 사용하는 프로세스 (상위 10개):"
ps aux --sort=-%mem | head -11
echo ""

echo "3. Node.js 프로세스 상태:"
ps aux | grep node | grep -v grep
if [ $? -eq 0 ]; then
    echo "✓ Node.js 프로세스가 실행 중입니다."
else
    echo "✗ Node.js 프로세스가 실행되지 않았습니다."
fi
echo ""

echo "4. PM2 프로세스 상태 (설치된 경우):"
if command -v pm2 &> /dev/null; then
    pm2 list
else
    echo "PM2가 설치되어 있지 않습니다."
fi
echo ""

echo "5. 시스템 전체 메모리 정보:"
cat /proc/meminfo | grep -E "MemTotal|MemFree|MemAvailable|Buffers|Cached"
echo ""

echo "6. 메모리 부족으로 종료된 프로세스 확인 (최근 100줄):"
dmesg | grep -i "out of memory" | tail -5
dmesg | grep -i "killed process" | tail -5
echo ""

echo "=== 확인 완료 ==="
echo ""
echo "권장 사항:"
echo "- MemAvailable이 50MB 미만이면 서버 실행이 어려울 수 있습니다."
echo "- Node.js는 최소 30-50MB의 메모리가 필요합니다."
echo "- 메모리 부족 시 서버 사양 업그레이드를 고려하세요."
