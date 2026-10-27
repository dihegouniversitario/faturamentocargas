import { createFileRoute, redirect } from "@tanstack/react-router";
import { meQuery } from "@/lib/session";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Cargas Coca" },
      { name: "description", content: "Plataforma interna de cargas entre Remessa e Faturamento." },
      { property: "og:title", content: "Cargas Coca" },
      { property: "og:description", content: "Plataforma interna de cargas entre Remessa e Faturamento." },
    ],
  }),
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.fetchQuery(meQuery);
    if (!me) throw redirect({ to: "/auth" });
    if (me.roles.includes("faturamento")) throw redirect({ to: "/faturamento" });
    if (me.roles.includes("remessa")) throw redirect({ to: "/importar" });
    if (me.roles.includes("admin")) throw redirect({ to: "/usuarios" });
    throw redirect({ to: "/acompanhamento" });
  },
  component: () => null,
});
