// Firebase 연결 (구글 로그인 + Firestore). 설정값은 웹에 공개되는 값이라 코드에 둬도 된다.
// 접근 제한은 firestore.rules 가 한다 (본인 데이터만 읽기/쓰기).
import type { FirebaseApp } from "firebase/app";
import type { Auth, User } from "firebase/auth";
import type { Firestore } from "firebase/firestore";

const env = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
};

/** 콘솔의 firebaseConfig 값을 여기에 붙여 넣는다 (환경변수가 있으면 그쪽이 우선) */
const FILE_CONFIG = {
  apiKey: "AIzaSyBrrDA9pWtXivkjySl9su9oraSQFcwuEgg",
  authDomain: "flashcard-838b7.firebaseapp.com",
  projectId: "flashcard-838b7",
  appId: "1:453870564537:web:a23a3cf5dde9c307729768",
  messagingSenderId: "453870564537",
  storageBucket: "flashcard-838b7.firebasestorage.app",
};

export const firebaseConfig = env.apiKey && env.projectId ? env : FILE_CONFIG;
export const firebaseEnabled = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let cached: Promise<{ app: FirebaseApp; auth: Auth; db: Firestore }> | null = null;

/** 필요할 때만 SDK를 불러온다 (첫 화면을 가볍게) */
export function getFirebase() {
  if (!firebaseEnabled) throw new Error("firebase not configured");
  cached ??= (async () => {
    const [{ initializeApp, getApps }, { getAuth }, { initializeFirestore, getFirestore }] = await Promise.all([
      import("firebase/app"),
      import("firebase/auth"),
      import("firebase/firestore"),
    ]);
    const existing = getApps()[0];
    const app = existing ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    let db: Firestore;
    try {
      db = initializeFirestore(app, { ignoreUndefinedProperties: true });
    } catch {
      db = getFirestore(app);
    }
    // 테스트용: localStorage에 fb-emulator 가 있으면 로컬 에뮬레이터에 연결
    if (useEmulator()) {
      const [{ connectAuthEmulator }, { connectFirestoreEmulator }] = await Promise.all([import("firebase/auth"), import("firebase/firestore")]);
      try { connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true }); } catch {}
      try { connectFirestoreEmulator(db, "127.0.0.1", 8080); } catch {}
    }
    return { app, auth, db };
  })();
  return cached;
}

function useEmulator(): string | null {
  try { return localStorage.getItem("fb-emulator"); } catch { return null; }
}

export async function signInWithGoogle(): Promise<void> {
  const { auth } = await getFirebase();
  const emu = useEmulator();
  if (emu) {
    const { GoogleAuthProvider, signInWithCredential } = await import("firebase/auth");
    await signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: emu, email: emu + "@test.dev", email_verified: true })));
    return;
  }
  const { GoogleAuthProvider, signInWithPopup, signInWithRedirect } = await import("firebase/auth");
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    const code = (e as { code?: string }).code ?? "";
    // 팝업이 막힌 환경(일부 홈 화면 앱)에서는 페이지 이동 방식으로
    if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
      await signInWithRedirect(auth, provider);
      return;
    }
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return;
    throw e;
  }
}

export async function signOutFirebase(): Promise<void> {
  const { auth } = await getFirebase();
  const { signOut } = await import("firebase/auth");
  await signOut(auth);
}

export async function watchUser(cb: (u: User | null) => void): Promise<() => void> {
  const { auth } = await getFirebase();
  const { onAuthStateChanged, getRedirectResult } = await import("firebase/auth");
  getRedirectResult(auth).catch(() => {});
  return onAuthStateChanged(auth, cb);
}
