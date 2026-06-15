import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WorkOS",
    short_name: "WorkOS",
    description:
      "The compression-conscious operating system for teams that think.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#FAF8F3",
    theme_color: "#1F3A3D",
    categories: ["productivity"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
