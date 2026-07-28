export const metadata = {
  title: "SitTest Poker — Texas Hold'em entre amis",
  description:
    "Poker Texas Hold'em No-Limit multijoueur en temps réel. Jetons virtuels, comptes créés via Discord.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
