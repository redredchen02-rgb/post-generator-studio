import type { Metadata } from "next";
import Link from "next/link";
import { History, Settings, Sparkles } from "lucide-react";
import "./globals.css";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/presentation/components/theme-toggle";

export const metadata: Metadata = {
  title: "Post Generator Studio",
  description: "Local-first AI content generation engine",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>): React.ReactElement {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <div className="min-h-screen pb-16 lg:pb-0">
          <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
            <div className="mx-auto flex h-14 max-w-[1680px] items-center justify-between px-4">
              <Link href="/" className="flex items-center gap-2 font-semibold">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="hidden sm:inline">Post Generator Studio</span>
              </Link>
              <nav className="flex items-center gap-1">
                <NavLink href="/" label="Generate" icon={<Sparkles className="h-4 w-4" />} />
                <NavLink href="/history" label="History" icon={<History className="h-4 w-4" />} />
                <NavLink href="/settings" label="Settings" icon={<Settings className="h-4 w-4" />} />
                <div className="ml-2">
                  <ThemeToggle />
                </div>
              </nav>
            </div>
          </header>
          <main className="fade-in">{children}</main>
          <nav className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur lg:hidden">
            <div className="flex items-center justify-around px-4 py-2">
              <MobileNavLink href="/" label="Generate" icon={<Sparkles className="h-5 w-5" />} />
              <MobileNavLink href="/history" label="History" icon={<History className="h-5 w-5" />} />
              <MobileNavLink href="/settings" label="Settings" icon={<Settings className="h-5 w-5" />} />
            </div>
          </nav>
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

function MobileNavLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }): React.ReactElement {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}
