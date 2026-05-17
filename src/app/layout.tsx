import type { Metadata } from "next";
import { Geist, Geist_Mono, Poppins } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Tack. — Trình tạo thời khóa biểu AI",
  description:
    "Trình tạo thời khóa biểu thông minh sử dụng AI và Google OR-Tools. Tự động phân tích ràng buộc, tạo lịch tối ưu và xác minh kết quả.",
  keywords: [
    "thời khóa biểu",
    "AI",
    "OR-Tools",
    "tối ưu",
    "phân công",
    "giáo viên",
    "lớp học",
  ],
  authors: [{ name: "Tack." }],
  icons: {
    icon: "/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${poppins.variable} antialiased bg-background text-foreground font-[family-name:var(--font-poppins)]`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
