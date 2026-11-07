# 수학 코치 (MVP)

애플펜슬로 일차방정식을 한 줄씩 풀면 줄마다 맞았는지 확인해 주는 코칭 웹앱입니다.

- `web/`: Next.js + TypeScript 프런트와 서버 API
- `web/api/index.py`: FastAPI + SymPy 수식 검증 (Vercel Python 함수로 함께 배포, `/api/py/*`)
- `web/verifier_tests/`: 검증 로직 테스트 (`npm run test:py`)

## 실행

```bash
cd web
npm install
pip install -r requirements.txt uvicorn
npm run dev:py   # 검증 서버 (다른 터미널)
npm run dev
```

같은 와이파이의 아이패드에서 접속하려면 `npm run dev:lan`으로 실행하고 `http://<컴퓨터 IP>:3000`을 여세요.

## 배포 (Vercel)

Vercel에서 이 저장소를 가져오고 **Root Directory**를 `web`으로 설정합니다.
