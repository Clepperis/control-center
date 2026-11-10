"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { X, ArrowUpRight, Circle } from "@phosphor-icons/react";
import Link from "next/link";
import { useRef, type ReactNode } from "react";
import type { ConnectionState } from "@/domain/models";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "muted" | "positive" | "warning" | "danger";
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
export function ConnectionBadge({ state }: { state: ConnectionState }) {
  const labels = {
    demo: "Demonstracija",
    disconnected: "Neprijungta",
    unavailable: "Nepasiekiama",
    verified: "Patikrinta",
  };
  return (
    <Badge
      tone={
        state.kind === "verified"
          ? "positive"
          : state.kind === "unavailable"
            ? "warning"
            : "muted"
      }
    >
      <Circle size={6} weight="fill" />
      {labels[state.kind]}
    </Badge>
  );
}
export function SectionTitle({
  title,
  href,
  action,
}: {
  title: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="section-title">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {href && (
        <Link className="text-link" href={href}>
          {action ?? "Peržiūrėti"}
          <ArrowUpRight size={15} />
        </Link>
      )}
    </div>
  );
}
export function Modal({
  title,
  description,
  trigger,
  children,
}: {
  title: string;
  description: string;
  trigger: ReactNode;
  children: ReactNode;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog.Root>
      <Dialog.Trigger ref={triggerRef} asChild>
        {trigger}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className="modal-content"
          onCloseAutoFocus={(event) => {
            if (!triggerRef.current?.isConnected) {
              event.preventDefault();
              document.getElementById("main-content")?.focus();
            }
          }}
        >
          <Dialog.Title className="text-xl font-semibold pr-8">
            {title}
          </Dialog.Title>
          <Dialog.Description className="muted mt-3 mb-6">
            {description}
          </Dialog.Description>
          {children}
          <Dialog.Close
            className="icon-button absolute top-4 right-4"
            aria-label="Uždaryti"
          >
            <X size={20} />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function EmptyState({
  title,
  children,
  icon,
}: {
  title: string;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-icon">{icon}</div>}
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="muted max-w-lg mx-auto mt-3">{children}</div>
    </div>
  );
}
