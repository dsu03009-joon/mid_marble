# 중세 마블 (온라인 버전)

서양 중세 복습 보드게임 — GitHub Pages(웹페이지) + Firebase Realtime Database(실시간 동기화)

- 학생 주소: `https://<깃허브아이디>.github.io/<저장소이름>/`
- 교사 주소: `https://<깃허브아이디>.github.io/<저장소이름>/teacher.html` (기본 비밀번호 1234)
- 교사 화면이 게임을 진행하는 '서버' 역할을 합니다. **수업 중에는 교사 화면 탭을 닫지 마세요.**

## 1. Firebase 준비 (처음 한 번)
1. https://console.firebase.google.com 에서 프로젝트 만들기 (독수리 눈치싸움 등 이미 쓰던 프로젝트가 있으면 그대로 써도 됩니다)
2. 왼쪽 메뉴 **빌드 > Realtime Database > 데이터베이스 만들기** → 위치: 싱가포르(asia-southeast1) → **테스트 모드**로 시작
3. Realtime Database의 **규칙** 탭에서 `database.rules.json` 내용을 붙여넣고 게시
   - 이미 다른 게임 규칙이 있다면 `"rules": { ... }` 안에 `"medieval-marble": { ".read": true, ".write": true }` 한 줄 묶음만 추가
4. **프로젝트 설정(톱니바퀴) > 일반 > 내 앱 > 웹(</>)** 앱 등록 → 나오는 `firebaseConfig` 값을 `config.js`에 붙여넣기 (databaseURL 줄이 있어야 함)

## 2. GitHub Pages에 올리기
1. GitHub에서 **New repository** → 이름 예: `medieval-marble` → Public → Create
2. **Add file > Upload files** → 이 폴더 안의 파일과 img 폴더를 모두 끌어다 놓고 Commit
3. 저장소 **Settings > Pages** → Source: `Deploy from a branch`, Branch: `main` / `(root)` → Save
4. 1~2분 뒤 위의 학생 주소로 접속 확인

## 3. 수업 진행
1. 교사 화면(teacher.html) 접속 → 비밀번호 입력 → 게임 만들기 (개인전/팀전)
2. 학생은 학생 주소로 접속해 이름을 넣고 입장 → 교사가 시작
3. 다른 기기에서 교사 화면을 열면 ‘이 화면에서 진행하기’ 버튼으로 진행을 넘겨받을 수 있습니다(한 번에 한 화면만 진행).

## 비밀번호 바꾸기
교사 화면 로그인 창의 **비밀번호 바꾸기** → 새 비밀번호 입력 → 나온 줄을 `config.js`의 `TEACHER_PASSWORD_HASH` 줄과 바꿔서 다시 업로드

## 문제 수정
`questions.json`을 수정해 다시 업로드 (cells: 보드 칸, extra: 돌발 퀴즈 문제)

## 참고
- 학교 수업용 간이 보안입니다. 웹페이지 파일은 누구나 볼 수 있으므로, 개발자 도구를 다룰 줄 아는 학생은 정답 파일을 볼 수도 있어요.
- 게임 기록은 Firebase의 `medieval-marble` 폴더에만 저장됩니다. 교사 화면의 ‘모든 게임 삭제’로 정리할 수 있어요.
