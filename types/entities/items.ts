export interface Items {
  item_code: number;
  category_ID: number;
  item_name: string;
  material: string;
  brand: string;
  quality?: 'Budget' | 'Standard' | 'Premium';
  unit: string;
  size_width: number;
  size_length: number;
  color: string;
  description?: string;
}