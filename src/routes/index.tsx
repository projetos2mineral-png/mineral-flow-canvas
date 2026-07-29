import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Mineral Flow" },
      { name: "description", content: "Mineral Flow" },
      { property: "og:title", content: "Mineral Flow" },
      { property: "og:description", content: "Mineral Flow" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <h1 className="text-4xl font-semibold tracking-tight text-foreground">
        Mineral Flow
      </h1>
    </div>
  );
}
