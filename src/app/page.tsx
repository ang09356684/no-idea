import Header from "@/components/Header";
import InputForm from "@/components/InputForm";
import Link from "next/link";

const BROWSE_LINKS = [
  { href: "/exhibitions", label: "展覽", icon: "🎨" },
  { href: "/concerts", label: "演唱會", icon: "🎤" },
  { href: "/music", label: "音樂會", icon: "🎼" },
  { href: "/theater", label: "戲劇", icon: "🎭" },
  { href: "/movies", label: "電影", icon: "🎬" },
  { href: "/attractions", label: "景點", icon: "🏞️" },
  { href: "/food", label: "美食", icon: "🍽️" },
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center px-4 py-8">
      <Header />
      <InputForm />

      <Link
        href="/favorites"
        className="mt-8 flex w-full max-w-lg items-center justify-center gap-2 rounded-xl border-2 py-3 text-sm font-medium transition-opacity hover:opacity-80"
        style={{
          borderColor: "var(--theme-heart)",
          color: "var(--theme-heart)",
          backgroundColor: "color-mix(in srgb, var(--theme-heart) 10%, transparent)",
        }}
      >
        ❤️ 我的最愛
      </Link>

      <Link
        href="/pocket-list"
        className="mt-3 flex w-full max-w-lg items-center justify-center gap-2 rounded-xl border-2 py-3 text-sm font-medium transition-opacity hover:opacity-80"
        style={{
          borderColor: "var(--theme-pin)",
          color: "var(--theme-pin)",
          backgroundColor: "color-mix(in srgb, var(--theme-pin) 10%, transparent)",
        }}
      >
        🔖 口袋名單
      </Link>

      <div className="mt-3 grid w-full max-w-lg grid-cols-2 gap-3">
        {BROWSE_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-900/60 backdrop-blur py-3 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors hover:bg-white dark:hover:bg-gray-900"
          >
            {link.icon} {link.label}
          </Link>
        ))}
      </div>
    </main>
  );
}
