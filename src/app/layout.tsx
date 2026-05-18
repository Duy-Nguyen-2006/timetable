import type { Metadata } from "next";
import "./globals.css";

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
        className="antialiased dark"
        style={{ margin: 0, background: '#0a0a0a', color: '#ffffff', fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif", fontWeight: 500 }}
      >
        {children}
      </body>
    </html>
  );
}
