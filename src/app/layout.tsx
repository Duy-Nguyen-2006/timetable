import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400"],
});

export const metadata: Metadata = {
  title: "Timetable - Thời khóa biểu điện tử",
  description: "Thiết lập giảng dạy điện tử - Xếp thời khóa biểu tự động bằng AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}
        style={{ margin: 0, background: '#0a0a0a', color: '#ffffff', fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif", fontWeight: 400 }}
      >
        {children}
      </body>
    </html>
  );
}
