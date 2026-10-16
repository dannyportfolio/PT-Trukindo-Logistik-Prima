import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { ConditionalFooter } from "@/components/public/ConditionalFooter";

export const metadata: Metadata = {
  metadataBase: new URL("https://trukindo.co.id"),
  title: "PT Trukindo Logistik Prima — Trukindo Logistics Platform",
  description:
    "Solusi Transportasi Darat B2B, Angkutan Muatan Penuh (FTL), Scheduled Linehaul & Dedicated Contract Logistics di Indonesia.",
  openGraph: {
    title: "PT Trukindo Logistik Prima — B2B Freight Logistics",
    description:
      "Penyedia transportasi muatan darat terpercaya untuk pengiriman Full Truck Load (FTL), scheduled linehaul, dan armada kontrak terdedikasi di Indonesia.",
    url: "https://trukindo.co.id",
    siteName: "PT Trukindo Logistik Prima",
    images: [
      {
        url: "/images/hero/hero-truck-highway.jpg",
        width: 1200,
        height: 675,
        alt: "Armada truk niaga komersial unbranded di koridor Trans-Jawa",
      },
    ],
    locale: "id_ID",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>
        <Navbar />
        <main>{children}</main>
        <ConditionalFooter />
      </body>
    </html>
  );
}
