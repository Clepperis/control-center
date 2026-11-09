import type { Dashboard } from "@/domain/models";
// Fictional review fixtures. Never inferred from the owner's infrastructure.
export const demoDashboard: Dashboard = {
  mode: "demo",
  projects: [
    { id: "archive", name: "Namų archyvas", description: "Dokumentai, kuriuos lengva rasti.", stage: "Rengiamas planas", code: "NA" },
    { id: "week", name: "Savaitės ritmas", description: "Mažiau administravimo, daugiau laiko.", stage: "Laukia peržiūros", code: "SR" },
    { id: "library", name: "Asmeninė biblioteka", description: "Mintys ir šaltiniai vienoje vietoje.", stage: "Idėja", code: "AB" },
  ],
  tasks: [
    { id: "t1", title: "Peržiūrėti dokumentų skirstymo planą", projectId: "archive", state: "review" },
    { id: "t2", title: "Apibrėžti savaitės santraukos turinį", projectId: "week", state: "planned" },
    { id: "t3", title: "Pasirinkti žinių katalogo struktūrą", projectId: "library", state: "waiting" },
  ],
  decisions: [
    { id: "d1", title: "Dokumentų skirstymo planas", detail: "Siūlomi 4 katalogai ir vienas bendras gautų dokumentų aplankas. Peržiūrėkite struktūrą prieš tęsdami.", project: "Namų archyvas" },
    { id: "d2", title: "Savaitės santraukos apimtis", detail: "Pavyzdiniame plane siūloma įtraukti užduotis ir sprendimus. Tvarkaraštis dar nesukurtas.", project: "Savaitės ritmas" },
  ],
  activity: [
    { id: "a1", title: "Pridėtas plano juodraštis", detail: "Namų archyvas · pavyzdinis įrašas", time: "10:24" },
    { id: "a2", title: "Pažymėtas sprendimas peržiūrai", detail: "Savaitės ritmas · pavyzdinis įrašas", time: "09:40" },
    { id: "a3", title: "Sukurta projekto idėja", detail: "Asmeninė biblioteka · pavyzdinis įrašas", time: "Vakar" },
  ],
  agents: [
    { id: "planner", name: "Planuotojas", role: "Tikslų ir užduočių planai", status: "Pavyzdinis vaidmuo", eligible: false },
    { id: "researcher", name: "Tyrėjas", role: "Šaltinių atranka ir analizė", status: "Pavyzdinis vaidmuo", eligible: false },
    { id: "improve", name: "Sistemos tobulintojas", role: "Izoliuoti pakeitimai ir patikra", status: "Numatytas vaidmuo", eligible: false },
  ],
  connections: [
    { id: "paperclip", name: "Paperclip", purpose: "Agentų užduotys ir vykdymas", state: { kind: "disconnected", detail: "Programos prieiga nesukonfigūruota." } },
    { id: "n8n", name: "n8n", purpose: "Automatizacijos ir tvarkaraščiai", state: { kind: "disconnected", detail: "Integracija numatyta vėlesniam etapui." } },
    { id: "nexos", name: "nexos.ai", purpose: "Modelių prieigos taškas", state: { kind: "disconnected", detail: "Reikia atskiro programos API rakto ir modelio." } },
    { id: "knowledge", name: "Markdown", purpose: "Patvirtintos projekto žinios", state: { kind: "demo", detail: "Rodomi tik pavyzdiniai dokumentai." } },
  ],
};
