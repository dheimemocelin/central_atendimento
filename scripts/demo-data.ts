export const DEMO_COUNT = 48;
export function demoLeads() {
  const stages = [
    "new",
    "attempt",
    "active",
    "waiting",
    "won",
    "lost",
  ] as const;
  return Array.from({ length: DEMO_COUNT }, (_, index) => ({
    id: `demo-lead-${String(index + 1).padStart(3, "0")}`,
    name: `Contato demonstrativo ${String(index + 1).padStart(3, "0")}`,
    email: `contato${index + 1}@example.invalid`,
    phone: null,
    source: "Campanha fictícia",
    stageId: stages[index % stages.length],
    // Blocks of six keep each portfolio balanced across all six stages.
    ownerId: Math.floor(index / 6) % 2 === 0 ? "demo-agent-a" : "demo-agent-b",
  }));
}
