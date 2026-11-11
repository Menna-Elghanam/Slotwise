"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/components/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, EmptyState, Skeleton } from "@/components/ui/feedback";
import { Input, Label, Select } from "@/components/ui/form";
import { api, errorMessage, queryString } from "@/lib/api";
import { RequireAuth } from "@/lib/auth";
import { CATEGORY_LABELS, formatMoney, STATUS_LABELS } from "@/lib/format";
import type { AdminBusiness, AdminStats, AdminUser, BookingStatus, Paginated } from "@/lib/types";
import { useDebouncedValue } from "@/lib/use-debounced-value";

function Stats() {
  const stats = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => api.get<{ stats: AdminStats }>("/admin/stats").then((r) => r.stats),
  });
  if (stats.isPending) {
    return <Skeleton className="h-24" />;
  }
  if (stats.isError) {
    return <Alert tone="error">{errorMessage(stats.error)}</Alert>;
  }
  const { users, businesses, bookings, paidCents } = stats.data;
  const totalBookings = Object.values(bookings).reduce((sum, n) => sum + n, 0);
  const tiles = [
    { label: "Users", value: users },
    { label: "Active businesses", value: businesses.ACTIVE ?? 0 },
    { label: "Bookings", value: totalBookings },
    { label: "Paid (kept)", value: formatMoney(paidCents, "EUR") },
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-4 sm:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.label}>
            <CardContent>
              <p className="text-sm text-muted-foreground">{tile.label}</p>
              <p className="text-2xl font-semibold">{tile.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        {(Object.entries(bookings) as [BookingStatus, number][])
          .map(([status, n]) => `${STATUS_LABELS[status]}: ${n}`)
          .join(" · ") || "No bookings yet"}
      </p>
    </div>
  );
}

function Pager({
  page,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages === 1) {
    return null;
  }
  return (
    <div className="flex items-center justify-end gap-3 text-sm">
      <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </Button>
      <span>
        Page {page} of {pages}
      </span>
      <Button
        size="sm"
        variant="secondary"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
      >
        Next
      </Button>
    </div>
  );
}

function Businesses() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const term = useDebouncedValue(search.trim());
  const list = useQuery({
    queryKey: ["admin", "businesses", term, status, page],
    queryFn: () =>
      api.get<Paginated<AdminBusiness>>(
        `/admin/businesses${queryString({ search: term, status, page, pageSize: 20 })}`,
      ),
    // Keep the current rows on screen while the next page loads.
    placeholderData: keepPreviousData,
  });
  const setBusinessStatus = useMutation({
    mutationFn: ({ id, next }: { id: string; next: "ACTIVE" | "SUSPENDED" }) =>
      api.patch(`/admin/businesses/${id}`, { status: next }),
    onSuccess: async (_data, { next }) => {
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
      toast(next === "SUSPENDED" ? "Business suspended" : "Business reactivated");
    },
    onError: (err) => toast(errorMessage(err), "error"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Businesses</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="business-search">Name</Label>
            <Input
              id="business-search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="business-status">Status</Label>
            <Select
              id="business-status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All</option>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
            </Select>
          </div>
        </div>
        {list.isPending ? (
          <Skeleton className="h-40" />
        ) : list.isError ? (
          <Alert tone="error">{errorMessage(list.error)}</Alert>
        ) : list.data.items.length === 0 ? (
          <EmptyState title="No businesses match" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th scope="col" className="py-2 pr-4">
                    Business
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    Owner
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    Bookings
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    Status
                  </th>
                  <th scope="col" className="py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list.data.items.map((b) => (
                  <tr key={b.id}>
                    <td className="py-2 pr-4">
                      <Link href={`/b/${b.slug}`} className="font-medium hover:underline">
                        {b.name}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {CATEGORY_LABELS[b.category]}
                      </span>
                    </td>
                    <td className="py-2 pr-4">{b.owner.email}</td>
                    <td className="py-2 pr-4 tabular-nums">{b._count.bookings}</td>
                    <td className="py-2 pr-4">
                      <Badge tone={b.status === "ACTIVE" ? "success" : "danger"}>
                        {b.status === "ACTIVE" ? "Active" : "Suspended"}
                      </Badge>
                    </td>
                    <td className="py-2 text-right">
                      <Button
                        size="sm"
                        variant={b.status === "ACTIVE" ? "secondary" : "primary"}
                        pending={
                          setBusinessStatus.isPending && setBusinessStatus.variables?.id === b.id
                        }
                        onClick={() =>
                          setBusinessStatus.mutate({
                            id: b.id,
                            next: b.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE",
                          })
                        }
                      >
                        {b.status === "ACTIVE" ? "Suspend" : "Reactivate"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.data && <Pager page={page} total={list.data.total} pageSize={20} onPage={setPage} />}
      </CardContent>
    </Card>
  );
}

function Users() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const term = useDebouncedValue(search.trim());
  const list = useQuery({
    queryKey: ["admin", "users", term, page],
    queryFn: () =>
      api.get<Paginated<AdminUser>>(
        `/admin/users${queryString({ search: term, page, pageSize: 20 })}`,
      ),
    placeholderData: keepPreviousData,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Users</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex max-w-sm flex-col gap-1.5">
          <Label htmlFor="user-search">Name or email</Label>
          <Input
            id="user-search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        {list.isPending ? (
          <Skeleton className="h-40" />
        ) : list.isError ? (
          <Alert tone="error">{errorMessage(list.error)}</Alert>
        ) : list.data.items.length === 0 ? (
          <EmptyState title="No users match" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th scope="col" className="py-2 pr-4">
                    Name
                  </th>
                  <th scope="col" className="py-2 pr-4">
                    Email
                  </th>
                  <th scope="col" className="py-2">
                    Joined
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list.data.items.map((u) => (
                  <tr key={u.id}>
                    <td className="py-2 pr-4">
                      {u.name} {u.isAdmin && <Badge tone="accent">Admin</Badge>}
                    </td>
                    <td className="py-2 pr-4">
                      {u.email}
                      {!u.emailVerifiedAt && (
                        <span className="ml-2 text-xs text-muted-foreground">(unconfirmed)</span>
                      )}
                    </td>
                    <td className="py-2">{new Date(u.createdAt).toLocaleDateString("en-GB")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.data && <Pager page={page} total={list.data.total} pageSize={20} onPage={setPage} />}
      </CardContent>
    </Card>
  );
}

export function AdminDashboard() {
  return (
    <RequireAuth admin>
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold">Platform admin</h1>
        <Stats />
        <Businesses />
        <Users />
      </div>
    </RequireAuth>
  );
}
