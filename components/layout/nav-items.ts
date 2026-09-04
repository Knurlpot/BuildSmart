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
  icon: LucideIcon;
  href: string;
  minStep: number;
  description?: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Manage Pricelist",
    icon: Tag,
    href: "/pricelist",
    minStep: 0,
  },
  {
    label: "Preferences & Rules",
    icon: SlidersHorizontal,
    href: "/management",
    minStep: 1,
  },
  {
    label: "Quotation Generation",
    icon: FileSpreadsheet,
    href: "/quotations/new",
    minStep: 2,
    description: "Generate project quotations from configured company data",
  },
  {
    label: "Open Projects",
    icon: FolderOpen,
    href: "/projects",
    minStep: 2,
  },
  {
    label: "Price Trends",
    icon: TrendingUp,
    href: "/market-intelligence",
    minStep: 2,
  },
];
