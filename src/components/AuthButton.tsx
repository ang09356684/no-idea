"use client";

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";

export default function AuthButton() {
  const { user, loading, configured, signInWithGoogle, signOutUser } = useAuth();
  const [busy, setBusy] = useState(false);

  // 未設定 Firebase 時不顯示（app 仍可瀏覽）
  if (!configured) return null;

  const handleSignIn = async () => {
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch {
      // 登入失敗（含使用者取消）忽略
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed left-4 top-4 z-40 h-10 w-10 animate-pulse rounded-full bg-gray-200 dark:bg-gray-800" />
    );
  }

  if (!user) {
    return (
      <button
        type="button"
        onClick={handleSignIn}
        disabled={busy}
        className="fixed left-4 top-4 z-40 flex items-center gap-2 rounded-full border border-gray-200 bg-white/90 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm backdrop-blur transition-opacity hover:opacity-90 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900/90 dark:text-gray-200"
      >
        <GoogleIcon />
        {busy ? "登入中..." : "用 Google 登入"}
      </button>
    );
  }

  const label = user.displayName ?? user.email ?? "已登入";

  return (
    <div className="fixed left-4 top-4 z-40 flex items-center gap-2">
      {user.photoURL ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.photoURL}
          alt={label}
          className="h-9 w-9 rounded-full border border-gray-200 dark:border-gray-700"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 text-sm font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-200">
          {label.slice(0, 1).toUpperCase()}
        </div>
      )}
      <button
        type="button"
        onClick={() => signOutUser()}
        className="rounded-full border border-gray-200 bg-white/90 px-3 py-1.5 text-xs font-medium text-gray-500 shadow-sm backdrop-blur transition-opacity hover:opacity-90 dark:border-gray-700 dark:bg-gray-900/90 dark:text-gray-400"
      >
        登出
      </button>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}
