import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Poppins } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["600"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400"],
});

export const metadata: Metadata = {
  title: "Timetable - Thời khóa biểu điện tử",
  description: "Thiết lập giảng dạy điện tử - Nhập dữ liệu và xem màn hình xếp lịch",
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
        className={`${inter.variable} ${poppins.variable} ${jetbrainsMono.variable} antialiased dark`}
        style={{ margin: 0, background: '#0a0a0a', color: '#ffffff', fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif", fontWeight: 500 }}
      >
        {children}
      </body>
    </html>
  );
}
