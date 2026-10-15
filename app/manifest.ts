import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HighKick",
    short_name: "HighKick",
    description: "An open-source vertical clip feed for Kick.com",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#060805",
    theme_color: "#060805",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
