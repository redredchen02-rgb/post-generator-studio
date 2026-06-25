import type { Metadata } from "next";
import Link from "next/link";
import { History, Settings, Sparkles } from "lucide-react";
import "./globals.css";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Post Generator Studio",
  description: "Local-first AI content generation engine",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>): React.ReactElement {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <div className="min-h-screen">
          <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
            <div className="mx-auto flex h-14 max-w-[1680px] items-center justify-between px-4">
              <Link href="/" className="flex items-center gap-2 font-semibold">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                </span>
                <span>Post Generator Studio</span>
              </Link>
              <nav className="flex items-center gap-1">
                <NavLink href="/" label="Generate" icon={<Sparkles className="h-4 w-4" />} />
                <NavLink href="/history" label="History" icon={<History className="h-4 w-4" />} />
                <NavLink href="/settings" label="Settings" icon={<Settings className="h-4 w-4" />} />
              </nav>
            </div>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}

function NavLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }): React.ReactElement {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}

