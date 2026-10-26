// ===== 중세 마블 온라인 설정 =====
// 1) Firebase 콘솔 > 프로젝트 설정(톱니바퀴) > 일반 > 내 앱(웹 </>) 의 firebaseConfig 값을 그대로 붙여넣으세요.
//    databaseURL 줄이 꼭 있어야 합니다. (Realtime Database를 만든 뒤 복사하세요)
window.FIREBASE_CONFIG = {
apiKey: "AIzaSyBoLkf0NTj5uAcmaOTPFxZmziRmyV-MexM",
  authDomain: "marble-162bb.firebaseapp.com",
  databaseURL: "https://marble-162bb-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "marble-162bb",
  storageBucket: "marble-162bb.firebasestorage.app",
  messagingSenderId: "392250667056",
  appId: "1:392250667056:web:494a290c0557fc18c9bdf5",
  measurementId: "G-ZM45V4JC99"
};

// 2) 이 게임 데이터가 저장될 폴더 이름. 다른 수업 게임(예: 독수리 눈치싸움)과 같은 Firebase 프로젝트를 써도 섞이지 않아요.
window.DB_ROOT = "medieval-marble";

// 3) 교사 비밀번호(SHA-256). 기본값은 1234 입니다.
//    교사 화면 > '비밀번호 바꾸기'에서 새 값을 만들어 아래 줄을 바꿔 주세요.
window.TEACHER_PASSWORD_HASH = "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4";
