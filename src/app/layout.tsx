import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VIN Delivery Tracker",
  description:
    "Stage-wise TAT, aging, and KPI dashboard for a VIN's processing journey.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
