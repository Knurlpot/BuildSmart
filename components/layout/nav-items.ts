import {
  User,
  Tag,
  SlidersHorizontal,
  FileSpreadsheet,
  FolderOpen,
  TrendingUp,
  Truck,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  description: string;
  icon: LucideIcon;
  href: string;
  minStep: number;
  color: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Account & Company Profile",
    description: "Update your profile and company details",
    icon: User,
    href: "/account",
    minStep: 0,
    color: "#64748b",
  },
  {
    label: "Manage Pricelist",
    description: "Manage your material price catalog",
    icon: Tag,
    href: "/pricelist",
    minStep: 0,
    color: "#10b981",
  },
  {
    label: "Company Preferences & Rules",
    description: "Configure business rules and pricing strategies",
    icon: SlidersHorizontal,
    href: "/management",
    minStep: 1,
    color: "#4f46e5",
  },
  {
    label: "Quotation Generation",
    description: "Create accurate project cost estimates",
    icon: FileSpreadsheet,
    href: "/quotations",
    minStep: 2,
    color: "#E07B39",
  },
  {
    label: "Open Projects",
    description: "Review and manage saved quotations",
    icon: FolderOpen,
    href: "/projects",
    minStep: 2,
    color: "#f59e0b",
  },
  {
    label: "Analyze Market Intelligence",
    description: "Analyze material price trends",
    icon: TrendingUp,
    href: "/market-intelligence",
    minStep: 2,
    color: "#06b6d4",
  },
  {
    label: "Benchmark Suppliers",
    description: "Compare supplier prices and rankings",
    icon: Truck,
    href: "/suppliers/benchmark",
    minStep: 2,
    color: "#8b5cf6",
  },
];
