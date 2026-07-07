import { Poppins } from "next/font/google";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-poppins",
});

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${poppins.variable} font-[family-name:var(--font-poppins)]`}>
      {children}
    </div>
  );
}
