import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Archivo, IBM_Plex_Mono } from "next/font/google";
import { I18nProvider } from "@/components/I18nProvider";
import ServiceWorker from "@/components/ServiceWorker";
import { getT } from "@/lib/i18n/server";
import { siteOrigin } from "@/lib/site";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["500", "700", "800"],
});

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export async function generateMetadata(): Promise<Metadata> {
  const [{ t }, origin] = await Promise.all([getT(), siteOrigin()]);
  return {
    metadataBase: new URL(origin),
    title: { default: t("meta.title"), template: "%s · HighKick" },
    description: t("meta.description"),
    applicationName: "HighKick",
    appleWebApp: { capable: true, title: "HighKick", statusBarStyle: "black-translucent" },
    openGraph: {
      type: "website",
      siteName: "HighKick",
      title: t("meta.title"),
      description: t("meta.description"),
    },
    twitter: { card: "summary_large_image" },
  };
}

export const viewport: Viewport = {
  themeColor: "#060805",
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { locale } = await getT();
  return (
    <html lang={locale} className="no-scrollbar">
      <body
        className={`${bricolage.variable} ${archivo.variable} ${plexMono.variable} grain antialiased`}
      >
        <I18nProvider locale={locale}>{children}</I18nProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
