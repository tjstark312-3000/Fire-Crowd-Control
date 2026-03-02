import {
  ColumnDef,
  ColumnFiltersState,
  RowSelectionState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Download, MoreHorizontal, Pin, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Camera, CameraStatus } from '../types';
import { cn } from '../lib/utils';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Input } from './ui/input';
import { Switch } from './ui/switch';

interface CameraRow {
  id: string;
  name: string;
  stream_url: string;
  status: CameraStatus;
  enabled: boolean;
  target_fps: number;
  alert_threshold: number;
  crowd_count: number;
  latency_ms: number;
  processed_fps: number;
  last_update_ts: string | null;
}

interface CamerasDataTableProps {
  cameras: Camera[];
  onPauseMany: (cameraIds: string[]) => void;
}

function formatStatus(status: CameraStatus): JSX.Element {
  if (status === 'online') {
    return <Badge variant="success">ONLINE</Badge>;
  }
  if (status === 'error') {
    return <Badge variant="danger">ERROR</Badge>;
  }
  return <Badge variant="muted">OFFLINE</Badge>;
}

function stickyStyles(column: { getIsPinned: () => false | 'left' | 'right'; getStart: (position: 'left') => number; getAfter: (position: 'right') => number }): React.CSSProperties {
  const isPinned = column.getIsPinned();
  if (!isPinned) {
    return {};
  }

  return {
    position: 'sticky',
    left: isPinned === 'left' ? `${column.getStart('left')}px` : undefined,
    right: isPinned === 'right' ? `${column.getAfter('right')}px` : undefined,
    zIndex: 3,
    background: 'hsl(var(--panel))',
  };
}

export function CamerasDataTable({ cameras, onPauseMany }: CamerasDataTableProps): JSX.Element {
  const navigate = useNavigate();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [globalSearch, setGlobalSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | CameraStatus>('all');
  const [densityFilter, setDensityFilter] = useState<'all' | 'high' | 'critical'>('all');
  const [dense, setDense] = useState(true);

  const data = useMemo<CameraRow[]>(
    () =>
      cameras.map((camera) => ({
        id: camera.id,
        name: camera.name,
        stream_url: camera.stream_url,
        status: camera.status,
        enabled: camera.enabled,
        target_fps: camera.target_fps,
        alert_threshold: camera.alert_threshold,
        crowd_count: camera.last_crowd_count ?? 0,
        latency_ms: camera.last_latency_ms ?? 0,
        processed_fps: camera.last_processed_fps ?? 0,
        last_update_ts: camera.last_update_ts,
      })),
    [cameras],
  );

  const filteredData = useMemo(() => {
    return data.filter((item) => {
      const text = `${item.name} ${item.stream_url}`.toLowerCase();
      const queryPass = !globalSearch || text.includes(globalSearch.toLowerCase());
      const statusPass = statusFilter === 'all' ? true : item.status === statusFilter;
      const densityPass =
        densityFilter === 'all'
          ? true
          : densityFilter === 'high'
            ? item.crowd_count >= 100
            : item.crowd_count >= 180;
      return queryPass && statusPass && densityPass;
    });
  }, [data, densityFilter, globalSearch, statusFilter]);

  const columns = useMemo<ColumnDef<CameraRow>[]>(
    () => [
      {
        id: 'select',
        size: 46,
        enableResizing: false,
        enableSorting: false,
        enableColumnFilter: false,
        header: ({ table }) => (
          <div onClick={(event) => event.stopPropagation()}>
            <Checkbox
              checked={table.getIsAllPageRowsSelected()}
              onCheckedChange={(value) => table.toggleAllPageRowsSelected(Boolean(value))}
              aria-label="Select all"
            />
          </div>
        ),
        cell: ({ row }) => (
          <div onClick={(event) => event.stopPropagation()}>
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
              aria-label="Select row"
            />
          </div>
        ),
      },
      {
        accessorKey: 'name',
        header: 'Camera',
        size: 240,
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{row.original.name}</p>
            <p className="max-w-[280px] truncate text-xs text-[hsl(var(--muted-foreground))]">{row.original.stream_url}</p>
          </div>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        size: 120,
        cell: ({ row }) => formatStatus(row.original.status),
        filterFn: 'includesString',
      },
      {
        accessorKey: 'crowd_count',
        header: 'Crowd',
        size: 110,
        cell: ({ row }) => <span className="font-mono text-sm">{row.original.crowd_count.toFixed(1)}</span>,
      },
      {
        accessorKey: 'processed_fps',
        header: 'FPS',
        size: 95,
        cell: ({ row }) => <span className="font-mono text-sm">{row.original.processed_fps.toFixed(2)}</span>,
      },
      {
        accessorKey: 'latency_ms',
        header: 'Latency',
        size: 110,
        cell: ({ row }) => <span className="font-mono text-sm">{row.original.latency_ms.toFixed(1)} ms</span>,
      },
      {
        accessorKey: 'target_fps',
        header: 'Target FPS',
        size: 100,
        cell: ({ row }) => <span className="font-mono text-sm">{row.original.target_fps}</span>,
      },
      {
        accessorKey: 'alert_threshold',
        header: 'Threshold',
        size: 105,
        cell: ({ row }) => <span className="font-mono text-sm">{row.original.alert_threshold}</span>,
      },
      {
        accessorKey: 'enabled',
        header: 'Enabled',
        size: 90,
        cell: ({ row }) => (row.original.enabled ? <Badge variant="success">ON</Badge> : <Badge variant="muted">OFF</Badge>),
      },
      {
        accessorKey: 'last_update_ts',
        header: 'Last Update',
        size: 160,
        cell: ({ row }) => (
          <span className="text-xs text-[hsl(var(--muted-foreground))]">
            {row.original.last_update_ts ? new Date(row.original.last_update_ts).toLocaleTimeString() : 'N/A'}
          </span>
        ),
      },
      {
        id: 'actions',
        size: 84,
        enableResizing: false,
        header: 'Actions',
        enableSorting: false,
        enableColumnFilter: false,
        cell: ({ row }) => (
          <div className="flex justify-end" onClick={(event) => event.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => navigate(`/camera/${row.original.id}`)}>Open detail</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onPauseMany([row.original.id])}>Pause analytics</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [navigate, onPauseMany],
  );

  const table = useReactTable({
    data: filteredData,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
    enableSorting: true,
    enableMultiSort: true,
    enableRowSelection: true,
    enableColumnPinning: true,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    initialState: {
      columnPinning: {
        left: ['select', 'name'],
        right: ['actions'],
      },
    },
  });

  const selectedRows = table.getSelectedRowModel().rows.map((row) => row.original.id);

  const exportCsv = () => {
    const headers = ['id', 'name', 'status', 'crowd_count', 'processed_fps', 'latency_ms', 'enabled', 'target_fps', 'alert_threshold'];
    const rows = table.getFilteredRowModel().rows.map((row) => {
      const item = row.original;
      return [
        item.id,
        item.name,
        item.status,
        item.crowd_count.toFixed(2),
        item.processed_fps.toFixed(2),
        item.latency_ms.toFixed(2),
        String(item.enabled),
        String(item.target_fps),
        String(item.alert_threshold),
      ]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cameras-export-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--panel))]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[hsl(var(--border))] p-3">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-[hsl(var(--muted-foreground))]" />
          <Input value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} placeholder="Search cameras..." className="pl-8" />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="sm">
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={column.getIsVisible()}
                  onCheckedChange={(value) => column.toggleVisibility(Boolean(value))}
                >
                  {column.id}
                </DropdownMenuCheckboxItem>
              ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => table.getColumn('name')?.pin('left')}>
              <Pin className="mr-2 h-3.5 w-3.5" /> Pin Name Left
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => table.getColumn('actions')?.pin('right')}>
              <Pin className="mr-2 h-3.5 w-3.5" /> Pin Actions Right
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as 'all' | CameraStatus)}
          className="h-9 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--panel-2))] px-3 text-sm"
        >
          <option value="all">All Status</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="error">Error</option>
        </select>

        <select
          value={densityFilter}
          onChange={(event) => setDensityFilter(event.target.value as 'all' | 'high' | 'critical')}
          className="h-9 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--panel-2))] px-3 text-sm"
        >
          <option value="all">All Density</option>
          <option value="high">High (100+)</option>
          <option value="critical">Critical (180+)</option>
        </select>

        <Button variant="secondary" size="sm" onClick={exportCsv}>
          <Download className="mr-1.5 h-4 w-4" />
          Export CSV
        </Button>

        <label className="ml-auto flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
          Dense
          <Switch checked={dense} onCheckedChange={setDense} />
        </label>
      </div>

      {selectedRows.length > 0 && (
        <div className="flex items-center gap-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--panel-2))] px-3 py-2 text-sm">
          <span>{selectedRows.length} selected</span>
          <Button variant="secondary" size="sm" onClick={() => onPauseMany(selectedRows)}>
            Pause selected
          </Button>
          <Button variant="ghost" size="sm" onClick={() => table.resetRowSelection()}>
            Clear
          </Button>
        </div>
      )}

      <div className="max-h-[64vh] overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-20 bg-[hsl(var(--panel))]">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const isSorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      style={{
                        width: header.getSize(),
                        ...stickyStyles(header.column),
                      }}
                      className="border-b border-[hsl(var(--border))] px-3 py-2 text-left align-middle"
                    >
                      <div className="flex items-center gap-2">
                        {header.isPlaceholder ? null : (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]"
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {isSorted === 'asc' ? '▲' : isSorted === 'desc' ? '▼' : ''}
                          </button>
                        )}
                      </div>
                      {header.column.getCanFilter() && (
                        <Input
                          value={(header.column.getFilterValue() as string) ?? ''}
                          onChange={(event) => header.column.setFilterValue(event.target.value)}
                          placeholder="Filter"
                          className="mt-2 h-7 text-xs"
                        />
                      )}
                      {header.column.getCanResize() && (
                        <div
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          className={cn(
                            'absolute right-0 top-0 h-full w-1 cursor-col-resize touch-none bg-transparent transition-colors hover:bg-[hsl(var(--accent))]',
                            header.column.getIsResizing() && 'bg-[hsl(var(--accent))]',
                          )}
                        />
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
                onClick={() => navigate(`/camera/${row.original.id}`)}
                className="cursor-pointer border-b border-[hsl(var(--border))] transition-colors hover:bg-[hsl(var(--panel-2))]"
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    style={{
                      width: cell.column.getSize(),
                      ...stickyStyles(cell.column),
                    }}
                    className={cn('px-3 align-middle', dense ? 'py-2' : 'py-3')}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {table.getRowModel().rows.length === 0 && (
          <div className="grid h-40 place-items-center text-sm text-[hsl(var(--muted-foreground))]">No cameras match current filters.</div>
        )}
      </div>
    </section>
  );
}
