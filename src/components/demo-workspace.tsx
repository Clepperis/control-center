"use client";
import { createContext, useContext, useEffect, useReducer, useState, type ReactNode } from "react";
import { z } from "zod";
const localSchema = z.object({ reviewed: z.array(z.string()), drafts: z.array(z.object({ id: z.string(), text: z.string(), kind: z.enum(["chat", "improve", "task"]) })) });
type Local = z.infer<typeof localSchema>;
type Action = { type: "review"; id: string } | { type: "draft"; text: string; kind: "chat" | "improve" | "task" } | { type: "load"; value: Local } | { type: "reset" };
const initial: Local = { reviewed: [], drafts: [] };
function reducer(state: Local, action: Action): Local {
  if (action.type === "load") return action.value;
  if (action.type === "reset") return initial;
  if (action.type === "review") return { ...state, reviewed: [...new Set([...state.reviewed, action.id])] };
  return { ...state, drafts: [...state.drafts, { id: crypto.randomUUID(), text: action.text, kind: action.kind }] };
}
const Context = createContext<{ state: Local; dispatch: React.Dispatch<Action> } | null>(null);
export function DemoWorkspace({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try { const saved = localStorage.getItem("control-center-demo-v1"); if (saved) { const value = localSchema.safeParse(JSON.parse(saved)); if (value.success) dispatch({ type: "load", value: value.data }); } } catch { setStorageError(true); }
      setReady(true);
    });
    return () => { active = false; };
  }, []);
  useEffect(() => { if (ready) { try { localStorage.setItem("control-center-demo-v1", JSON.stringify(state)); } catch { /* State remains available for this session. */ } } }, [state, ready]);
  return <Context.Provider value={{ state, dispatch }}>{storageError && <p role="status" className="notice mb-4">Naršyklės saugykla nepasiekiama. Pakeitimai galios tik šiame lange.</p>}{children}</Context.Provider>;
}
export function useDemo() { const context = useContext(Context); if (!context) throw new Error("Demo provider missing"); return context; }
