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

## 플래시카드 (`/cards`)

앙키 방식의 간격 반복 플래시카드. 홈 화면의 🗂️ 플래시카드 버튼으로 들어갑니다. 아이폰 세로 화면 기준으로 만들었습니다.

- 카드 종류: 기본, 기본+뒤집기, 빈칸(Cloze `{{c1::답::힌트}}`). `$수식$`, `**굵게**`, 사진 지원
- SM-2 스케줄러: 학습/재학습 단계, 다시·어려움·알맞음·쉬움, ease, 하루 한도, 형제 카드 미루기, 거머리(leech)
- 하위 덱(`수학::미적분`), 덱별 설정, 되돌리기, 깃발, 보류, 내일 보기
- 찾기: `deck:` `tag:` `is:due` `flag:1` `prop:ivl>=30` 등 앙키 검색 문법
- 통계, 전체 백업/복원(.json), 텍스트 가져오기/내보내기(CSV·TSV·앙키 일반 텍스트)
- 데이터는 각 기기의 브라우저(IndexedDB)에 저장되며 기기끼리 동기화되지 않습니다.
