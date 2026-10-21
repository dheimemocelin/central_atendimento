import type { Stage } from "../types";

const appearances: Record<
  string,
  { color: string; tint: string; emoji: string }
> = {
  new: { color: "#315bd8", tint: "#edf2ff", emoji: "🆕" },
  attempt: { color: "#7541b5", tint: "#f4edfc", emoji: "📞" },
  active: { color: "#087989", tint: "#e8f6f8", emoji: "💬" },
  waiting: { color: "#93600e", tint: "#fff5df", emoji: "⏰" },
  won: { color: "#247447", tint: "#ecf7ef", emoji: "🎉" },
  lost: { color: "#aa4149", tint: "#fff0f1", emoji: "📁" },
};

export function stageAppearance(stage: Pick<Stage, "id" | "kind">) {
  return (
    appearances[stage.id] ||
    (stage.kind === "WON"
      ? appearances.won
      : stage.kind === "LOST"
        ? appearances.lost
        : appearances.new)
  );
}
