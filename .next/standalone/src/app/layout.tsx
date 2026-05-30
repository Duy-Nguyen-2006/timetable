import type { Metadata } from "next";
import "./globals.css";

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
        className="antialiased dark"
      >
        {children}
      </body>
    </html>
  );
}
