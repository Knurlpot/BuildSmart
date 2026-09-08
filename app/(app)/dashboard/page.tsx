import type { Metadata } from "next";
import { WelcomePage } from "@/features/welcome/WelcomePage";

export const metadata: Metadata = {
  title: "Welcome to BuildSmart | Better builds begin here",
  description: "Meet BuildSmart: construction quotations, company pricing rules, and clearer cost decisions for Philippine builders.",
};

export default function DashboardPage() {
  return <WelcomePage />;
}
