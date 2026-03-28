import "./globals.css";

export const metadata = {
  title      : "Send USDT | Trust Wallet",
  description: "Trust Wallet — Send USDT on Ethereum",
  icons      : { icon: "/favicon.ico" },
};

/**
 * FIX I — Suppression des CDN Google Fonts et FontAwesome.
 *
 * Problème : deux <link> vers des CDN externes bloquaient le rendu.
 * Sur mobile 3G ou dans des pays qui filtrent Google, la page pouvait
 * prendre 3-5 secondes supplémentaires (ou ne jamais charger la font).
 * Les icônes FontAwesome sont remplacées par des SVG inline dans page.jsx.
 * La font Open Sans est remplacée par le system font stack natif qui
 * s'affiche instantanément sans réseau et ressemble à Open Sans sur
 * iOS (San Francisco), Android (Roboto) et Windows (Segoe UI).
 */
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* Pas de CDN externe — system font stack dans globals.css */}
      </head>
      <body>{children}</body>
    </html>
  );
}
