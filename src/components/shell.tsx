"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  SquaresFour,
  ChatCircle,
  Stack,
  Robot,
  Lightning,
  BookOpen,
  SlidersHorizontal,
  ArrowUpRight,
  Command,
  List,
  X,
  Wrench,
} from "@phosphor-icons/react";
import * as Dialog from "@radix-ui/react-dialog";
import { useState, type ReactNode } from "react";

export const navigation = [
  { href: "/", label: "Apžvalga", icon: SquaresFour },
  { href: "/chat", label: "Pokalbis", icon: ChatCircle },
  { href: "/projects", label: "Projektai ir užduotys", icon: Stack },
  { href: "/agents", label: "Agentai", icon: Robot },
  { href: "/automations", label: "Automatizacijos", icon: Lightning },
  { href: "/knowledge", label: "Žinios", icon: BookOpen },
  { href: "/improve", label: "Tobulinti sistemą", icon: Wrench },
  { href: "/settings", label: "Nustatymai ir ryšiai", icon: SlidersHorizontal },
];
function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Pagrindinis meniu" className="space-y-1">
      {navigation.map(({ href, label, icon: Icon }, i) => (
        <Link
          key={href}
          href={href}
          onClick={onNavigate}
          aria-current={pathname === href ? "page" : undefined}
          className={`nav-item ${i === 6 ? "mt-7" : ""}`}
        >
          <Icon size={20} />
          <span>{label}</span>
          {pathname === href && <span className="nav-dot" />}
        </Link>
      ))}
    </nav>
  );
}
function Brand() {
  return (
    <Link
      href="/"
      className="flex items-center gap-3 font-semibold tracking-tight"
    >
      <span className="brand-mark">
        <Command size={23} />
      </span>
      <span>
        Control Center
        <span className="block text-[11px] uppercase tracking-[.18em] text-stone-500 font-medium mt-1">
          Asmeninė darbo erdvė
        </span>
      </span>
    </Link>
  );
}
export function Shell({
  children,
  mode,
  authMode,
}: {
  children: ReactNode;
  mode: "demo" | "live";
  authMode: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const title =
    navigation.find((n) => n.href === pathname)?.label ?? "Darbo erdvė";
  return (
    <div className="min-h-dvh">
      <a className="skip-link" href="#main-content">
        Pereiti prie turinio
      </a>
      <aside className="sidebar">
        <Brand />
        <div className="mt-12 mb-4 px-3 overline">Darbo erdvė</div>
        <Navigation />
        <div className="sidebar-footer">
          <span className="owner-avatar">S</span>
          <div className="flex-1">
            <div className="text-sm font-medium">Savininko erdvė</div>
            <div className="text-xs text-stone-500 mt-1">
              {authMode === "development"
                ? "Vietinis kūrimo režimas"
                : "Patvirtinta tapatybė"}
            </div>
          </div>
          <span className="text-xs text-stone-500">01</span>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="flex items-center gap-3">
            <Dialog.Root open={open} onOpenChange={setOpen}>
              <Dialog.Trigger
                className="icon-button lg:hidden"
                aria-label="Atverti meniu"
              >
                <List size={23} />
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="modal-overlay" />
                <Dialog.Content className="mobile-menu">
                  <Dialog.Title className="sr-only">Navigacija</Dialog.Title>
                  <Dialog.Description className="sr-only">
                    Pasirinkite darbo erdvės puslapį.
                  </Dialog.Description>
                  <div className="flex justify-between items-center mb-10">
                    <Brand />
                    <Dialog.Close
                      className="icon-button"
                      aria-label="Uždaryti meniu"
                    >
                      <X size={20} />
                    </Dialog.Close>
                  </div>
                  <Navigation onNavigate={() => setOpen(false)} />
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
            <span className="text-stone-500 hidden sm:inline">Darbo erdvė</span>
            <span className="text-stone-300 hidden sm:inline">/</span>
            <span className="font-medium">{title}</span>
          </div>
          <Link href="/settings" className="text-link text-xs">
            <span className="status-dot" />
            {mode === "demo" ? "Demonstracinė aplinka" : "Programos duomenys"}
            <ArrowUpRight size={14} />
          </Link>
        </header>
        <div className="mode-banner">
          <span className="mode-label">
            {mode === "demo" ? "DEMO" : "PROGRAMOS REŽIMAS"}
          </span>
          <span>
            {mode === "demo"
              ? "Išgalvoti pavyzdžiai sąsajos peržiūrai. AI ir automatizacijos nevykdomos."
              : "Rodoma tik išsaugota būsena. Delegavimui reikalingas savininko patvirtinimas."}
          </span>
          {authMode === "development" && (
            <span className="hidden xl:inline ml-auto">
              Be prisijungimo · tik vietiniam kūrimui
            </span>
          )}
        </div>
        <main id="main-content" className="page-container">
          {children}
        </main>
        <footer className="page-footer">
          <span>Asmeninis AI valdymo centras</span>
          <span>
            {mode === "demo"
              ? "Demonstraciniai duomenys"
              : "Savininko darbo erdvė"}
          </span>
        </footer>
      </div>
    </div>
  );
}
