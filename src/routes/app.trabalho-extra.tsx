import { createFileRoute } from "@tanstack/react-router";
import { ModuleGuard } from "@/components/ModuleGuard";

export const Route = createFileRoute("/app/trabalho-extra")({
  head: () => ({
    meta: [
      { title: "Trabalho Extra | OmniBiz" },
      {
        name: "description",
        content:
          "Registo de trabalhos extra, verificação de disponibilidade dos funcionários e envio de convites.",
      },
      { property: "og:title", content: "Trabalho Extra | OmniBiz" },
      {
        property: "og:description",
        content:
          "Registo de trabalhos extra, verificação de disponibilidade dos funcionários e envio de convites.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ModuleGuard module="extra_work">
      <div>Trabalho Extra</div>
    </ModuleGuard>
  ),
});
