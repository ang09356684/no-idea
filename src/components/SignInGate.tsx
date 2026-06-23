"use client";

import { useState, type ReactNode } from "react";
import { useAuth } from "@/components/AuthProvider";

/**
 * 把需要登入才能使用的內容包起來：
 * - 未設定 Firebase → 直接放行（資料走 localStorage、不需登入，見 usePocketList / favorites）
 * - auth 載入中 → 顯示載入
 * - 未登入 → 顯示 Google 登入提示
 * - 已登入 → 顯示 children
 */
export default function SignInGate({
  children,
  message = "登入以使用此功能",
}: {
  children: ReactNode;
  message?: string;
}) {
  const { user, loading, configured, signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);

  // 未設定 Firebase：不需登入，內容改由 localStorage 支撐（本地單機模式），直接放行。
  if (!configured) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="py-16 text-center text-gray-400">載入中…</div>
    );
  }

  if (!user) {
    const handleSignIn = async () => {
      setBusy(true);
      try {
        await signInWithGoogle();
      } catch {
        // 取消或失敗忽略
      } finally {
        setBusy(false);
      }
    };
    return (
      <div className="py-16 text-center text-gray-400">
        <p className="mb-4 text-4xl">🔒</p>
        <p className="text-lg">{message}</p>
        <p className="mt-2 text-sm">你的清單會存在自己的帳號，跨裝置同步</p>
        <button
          type="button"
          onClick={handleSignIn}
          disabled={busy}
          className="mt-4 inline-block rounded-full px-6 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{
            backgroundColor: "var(--theme-accent)",
            color: "var(--theme-on-accent)",
          }}
        >
          {busy ? "登入中…" : "用 Google 登入"}
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
