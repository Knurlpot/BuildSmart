"use client";

import { useState } from "react";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";


interface SelectableConfig<TData> {
  getRowId: (row: TData) => string;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (visibleIds: string[]) => void;
}

interface DataTableProps<TData> {
  columns: ColumnDef<TData>[];
  data: TData[];
  initialSorting?: SortingState;
  globalFilter?: string;
  enablePagination?: boolean;
  pageSize?: number;
  compact?: boolean;
  selectable?: SelectableConfig<TData>;
  rowClassName?: (row: TData) => string;
}

export function DataTable<TData>({
  columns,
  data,
  initialSorting = [],
  globalFilter,
  enablePagination = false,
  pageSize = 50,
  compact = false,
  selectable,
  rowClassName,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize });

  const selectColumn: ColumnDef<TData> = {
    id: "__select",
    enableGlobalFilter: false,
    enableSorting: false,
    header: ({ table: t }) => {
      const pageIds = t.getRowModel().rows.map((r) => selectable!.getRowId(r.original));
      const allSelected = pageIds.length > 0 && pageIds.every((id) => selectable!.selectedIds.has(id));
      return (
        <input
          type="checkbox"
          checked={allSelected}
          onChange={() => selectable!.onToggleAll(pageIds)}
          aria-label="Select all rows on this page"
          className="h-3.5 w-3.5 rounded border-gray-300 accent-primary"
        />
      );
    },
    cell: ({ row }) => {
      const id = selectable!.getRowId(row.original);
      return (
        <input
          type="checkbox"
          checked={selectable!.selectedIds.has(id)}
          onChange={() => selectable!.onToggle(id)}
          aria-label="Select row"
          className="h-3.5 w-3.5 rounded border-gray-300 accent-primary"
        />
      );
    },
  };

  const table = useReactTable({
    data,
    columns: selectable ? [selectColumn, ...columns] : columns,
    state: { sorting, globalFilter, ...(enablePagination ? { pagination } : {}) },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    ...(enablePagination ? { getPaginationRowModel: getPaginationRowModel() } : {}),
  });

  const headCellCls = compact
    ? "px-2.5 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500 first:pl-3 last:pr-3"
    : "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 first:pl-6 last:pr-6";
  const bodyCellCls = compact
    ? "px-2.5 py-1 text-xs first:pl-3 last:pr-3"
    : "px-4 py-3.5 first:pl-6 last:pr-6";

  return (
    <div className="overflow-x-auto">
      <table className={`w-full ${compact ? "text-xs" : "text-sm"}`}>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b border-gray-100 bg-gray-50/60">
              {headerGroup.headers.map((header) => {
                const sortable = header.column.getCanSort();
                return (
                  <th
                    key={header.id}
                    onClick={sortable ? header.column.getToggleSortingHandler() : undefined}
                    className={`${headCellCls} ${sortable ? "cursor-pointer select-none" : ""}`}
                  >
                    {header.isPlaceholder ? null : (
                      <span className="inline-flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sortable && <ArrowUpDown className="h-3 w-3 text-gray-300" />}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              className={`border-b border-gray-50 transition-colors hover:bg-gray-50/60 ${
                rowClassName ? rowClassName(row.original) : ""
              }`}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className={bodyCellCls}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {enablePagination && (
        <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-xs text-gray-500">
          <span>
            Page {table.getState().pagination.pageIndex + 1} of{" "}
            {Math.max(table.getPageCount(), 1)} · {data.length} row{data.length !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 font-medium text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </button>
            <button
              type="button"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 font-medium text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
