import { mkdirSync, writeFileSync } from "node:fs";
import { demoLeads } from "./demo-data.js";
mkdirSync("samples", { recursive: true });
writeFileSync(
  "samples/leads-demo.csv",
  "Nome;Email;Origem\n" +
    demoLeads()
      .map((lead) => `${lead.name};${lead.email};${lead.source}`)
      .join("\n") +
    "\n",
  "utf8",
);
console.log(
  "samples/leads-demo.csv gerado com dados exclusivamente sintéticos e sem telefones.",
);
