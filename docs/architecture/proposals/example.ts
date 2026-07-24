// The URL is our single source of truth. `nuqs` reads/writes typed values
// to the query string. These four values ARE the table's entire state.
import { useQueryStates, parseAsString, parseAsInteger } from "nuqs";
import { useQuery, keepPreviousData } from "@tanstack/react-query";

function useTableParams() {
  return useQueryStates({
    from: parseAsString.withDefault("2026-04-01"),
    to: parseAsString.withDefault("2026-06-30"),
    status: parseAsString.withDefault("all"),
    sort: parseAsString.withDefault("date:desc"),
    page: parseAsInteger.withDefault(1),
  });
}

function useTransactions(params: ReturnType<typeof useTableParams>[0]) {
  return useQuery({
    // The cache key IS the params. Change any param → new key → refetch.
    // Same params seen before → served instantly from cache.
    queryKey: ["transactions", params],

    queryFn: async () => {
      const qs = new URLSearchParams({
        from: params.from,
        to: params.to,
        status: params.status,
        sort: params.sort,
        page: String(params.page),
        pageSize: "50",
      });
      const res = await fetch(`/api/transactions?${qs}`);
      if (!res.ok) throw new Error("Failed to load transactions");
      return res.json() as Promise<{ rows: Transaction[]; total: number }>;
    },

    // On page/sort change, keep showing the old rows until the new
    // ones arrive — no flash of empty table.
    placeholderData: keepPreviousData,
  });
}

import {
  useReactTable,
  getCoreRowModel,
  createColumnHelper,
  flexRender,
} from "@tanstack/react-table";

const col = createColumnHelper<Transaction>();

const columns = [
  col.accessor("id", { header: "Transaction ID" }),
  col.accessor("createdAt", { header: "Date" }),
  col.accessor("status", { header: "Status" }),
  col.accessor("amount", { header: "Amount" }),
];

function useTransactionTable(rows: Transaction[]) {
  return useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),

    // We do sorting/filtering/paging on the SERVER, so we tell
    // TanStack Table not to do it itself — just render what it's given.
    manualSorting: true,
    manualFiltering: true,
    manualPagination: true,
  });
}

("use client");

export function TransactionsTable() {
  const [params, setParams] = useTableParams(); // Part 1: URL state
  const { data, isLoading, isError } = useTransactions(params); // Part 2: data
  const table = useTransactionTable(data?.rows ?? []); // Part 3: table engine

  if (isError) return <p>Couldn’t load transactions. Try again.</p>;

  return (
    <div>
      {/* A filter control. Changing it just writes to the URL —
          and resets to page 1 so you're not stranded on page 4
          of the old result set. */}
      <select
        value={params.status}
        onChange={(e) => setParams({ status: e.target.value, page: 1 })}
      >
        <option value="all">All</option>
        <option value="disputed">Disputed</option>
        <option value="success">Success</option>
      </select>

      <table>
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((header) => {
                const key = header.column.id; // e.g. "amount"
                const isSorted = params.sort.startsWith(key);
                const nextDir =
                  isSorted && params.sort.endsWith("asc") ? "desc" : "asc";
                return (
                  // Clicking a header ALSO just writes to the URL.
                  <th
                    key={header.id}
                    onClick={() =>
                      setParams({ sort: `${key}:${nextDir}`, page: 1 })
                    }
                    style={{ cursor: "pointer" }}
                  >
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )}
                    {isSorted && (params.sort.endsWith("asc") ? " ▲" : " ▼")}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>

        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={columns.length}>Loading…</td>
            </tr>
          ) : (
            table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* Pagination — again, just writes page to the URL. */}
      <button
        disabled={params.page <= 1}
        onClick={() => setParams({ page: params.page - 1 })}
      >
        Prev
      </button>
      <span>Page {params.page}</span>
      <button onClick={() => setParams({ page: params.page + 1 })}>Next</button>
    </div>
  );
}
