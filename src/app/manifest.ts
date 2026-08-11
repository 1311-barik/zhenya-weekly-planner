import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Планнер Жени",
    short_name: "Планнер",
    description: "Персональный недельный планировщик",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f6f2ea",
    theme_color: "#c4704a",
    lang: "ru",
    categories: ["productivity", "lifestyle"],
    icons: [
      {
        src: "/icons/planner-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/planner-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/planner-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
