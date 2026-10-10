import "./globals.css";

export const metadata = {
  title: "Ifrah Collection POS",
  description: "Dress Rental Management System — Ifrah Collection",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
