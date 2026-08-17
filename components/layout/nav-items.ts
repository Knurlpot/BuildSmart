import {
  Tag,
  SlidersHorizontal,
  FileSpreadsheet,
  FolderOpen,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  description?: string;
  icon: LucideIcon;
  href: string;
  minStep: number;
  color: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Manage Pricelist",
    icon: Tag,
    href: "/pricelist",
    minStep: 0,
    color: "#10b981",
  },
  {
    label: "Preferences & Rules",
    icon: SlidersHorizontal,
    href: "/management",
    minStep: 1,
    color: "#4f46e5",
  },
  {
    label: "Quotation Generation",
    description: "Create accurate project cost estimates",
    icon: FileSpreadsheet,
    href: "/quotations/new",
    minStep: 2,
    color: "#E07B39",
  },
  {
    label: "Open Projects",
    icon: FolderOpen,
    href: "/projects",
    minStep: 2,
    color: "#f59e0b",
  },
  {
    label: "Price Trends",
    icon: TrendingUp,
    href: "/market-intelligence",
    minStep: 2,
    color: "#06b6d4",
  },
];
