import "./globals.css";

export const metadata = {
  title: "Caregiver Volunteer Matching Portal",
  description: "Frontend prototype for caregiver and volunteer peer support matching.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
