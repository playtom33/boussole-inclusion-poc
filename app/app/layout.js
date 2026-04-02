export const metadata = {
  title: 'Boussole de l\'Inclusion — Assistant',
  description: 'Assistant conversationnel pour la Boussole de l\'Inclusion par Tralalere',
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
