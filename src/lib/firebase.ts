import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";
import {
  getFirestore,
  connectFirestoreEmulator,
  type Firestore,
} from "firebase/firestore";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// 有 projectId 才算設定完成。未設定時 app 仍可正常瀏覽/產生行程，
// 只是登入與 Firestore 儲存停用（見 AuthProvider 的 configured 旗標）。
export const isFirebaseConfigured = Boolean(config.projectId);

const useEmulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true";

// 重要：getAuth() 會同步驗證 apiKey，未設定時呼叫會在 build 期 prerender 直接 throw。
// 因此只有設定完成才初始化；未設定就完全不碰 Firebase。
let authInstance: Auth | undefined;
let dbInstance: Firestore | undefined;

if (isFirebaseConfigured) {
  const app: FirebaseApp = getApps().length ? getApp() : initializeApp(config);
  authInstance = getAuth(app);
  dbInstance = getFirestore(app);

  // 開發時接 Firebase Emulator（不連雲端）。用 globalThis 旗標避免 HMR 重複連線。
  const g = globalThis as typeof globalThis & {
    __fbEmulatorConnected?: boolean;
  };
  if (useEmulator && typeof window !== "undefined" && !g.__fbEmulatorConnected) {
    connectAuthEmulator(authInstance, "http://localhost:9099", {
      disableWarnings: true,
    });
    connectFirestoreEmulator(dbInstance, "localhost", 8080);
    g.__fbEmulatorConnected = true;
  }
}

// auth / db 只有在 isFirebaseConfigured 為 true 時才會被實際使用
// （AuthProvider 與 hooks 都先以 configured/user 把關），故以斷言提供乾淨型別。
export const auth = authInstance as Auth;
export const db = dbInstance as Firestore;
