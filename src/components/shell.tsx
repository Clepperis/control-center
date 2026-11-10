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
  CaretDown,
  Info,
} from "@phosphor-icons/react";
import * as Dialog from "@radix-ui/react-dialog";
import { createContext, useContext, useState, type ReactNode } from "react";
import { PasswordLogout } from "./password-login";

const WorkspaceMode = createContext<"demo" | "live" | null>(null);

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
    <nav aria-label="Pagrindinis meniu" className="workspace-nav">
      {navigation.map(({ href, label, icon: Icon }, i) => (
        <Link
          key={href}
          href={href}
          onClick={onNavigate}
          aria-current={pathname === href ? "page" : undefined}
          className={`nav-item ${i === 6 ? "nav-secondary" : ""}`}
        >
          <Icon size={16} />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
function Brand() {
  return (
    <Link href="/" className="brand">
      <span className="brand-mark">
        <Command size={14} />
      </span>
      <span>Control Center</span>
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
  return (
    <WorkspaceMode.Provider value={mode}>
      <div className="min-h-dvh">
        <a className="skip-link" href="#main-content">
          Pereiti prie turinio
        </a>
        <aside className="sidebar">
          <Brand />
          <div className="sidebar-label">
            Darbo erdvė <CaretDown size={10} />
          </div>
          <Navigation />
          <div className="sidebar-footer">
            <span className="owner-avatar">S</span>
            <div className="flex-1">
              <div className="owner-label">Savininko erdvė</div>
              <div className="owner-detail">
                {authMode === "development"
                  ? "Vietinis kūrimo režimas"
                  : "Patvirtinta tapatybė"}
              </div>
            </div>
          </div>
        </aside>
        <div className="app-body">
          <main id="main-content" className="page-container" tabIndex={-1}>
            {children}
          </main>
          <footer className="page-footer">
            {authMode === "password" && <PasswordLogout />}
            <span>
              {authMode === "development"
                ? "Be prisijungimo · tik vietiniam kūrimui"
                : "Savininko sesija"}
            </span>
            <span>
              {mode === "demo"
                ? "Demonstracija · AI ir automatizacijos nevykdomos"
                : "Delegavimui reikalingas savininko patvirtinimas"}
            </span>
          </footer>
        </div>
      </div>
    </WorkspaceMode.Provider>
  );
}

export function WorkspaceHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  const mode = useContext(WorkspaceMode);
  const [open, setOpen] = useState(false);
  if (!mode) throw new Error("WorkspaceHeader must be rendered inside Shell.");
  return (
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
        <span className="workspace-symbol">
          <Command size={14} />
        </span>
        <h1>{title}</h1>
        <details className="page-info">
          <summary aria-label="Apie šį puslapį">
            <Info size={15} />
          </summary>
          <p>{description}</p>
        </details>
      </div>
      <div className="header-tools">
        <Link href="/settings" className="text-link text-xs">
          <span className="mode-label">
            {mode === "demo" ? "DEMO" : "PROGRAMA"}
          </span>
          <span className="hidden sm:inline">
            {mode === "demo" ? "Išgalvoti duomenys" : "Išsaugota būsena"}
          </span>
          <ArrowUpRight size={14} />
        </Link>
      </div>
      {action && <div className="header-action">{action}</div>}
    </header>
  );
}
