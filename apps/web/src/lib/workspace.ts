"use client";

import { useQueryClient } from "@tanstack/react-query";
import { queryKeys, useWorkspace } from "./auth";

/**
 * The staff members this user may manage, with the business time zone: the whole active
 * team for an owner, otherwise their own memberships. Used by Schedule and Hours.
 */
export function useManageableStaff() {
  const workspace = useWorkspace();
  const data = workspace.data;
  if (!data) {
    return { staff: [], isPending: workspace.isPending };
  }
  if (data.business) {
    const { business } = data;
    return {
      isPending: false,
      staff: business.staff
        .filter((member) => member.isActive)
        .map((member) => ({
          staffId: member.id,
          label: member.isOwner ? `${member.name} (you)` : member.name,
          timezone: business.timezone,
        })),
    };
  }
  return {
    isPending: false,
    staff: data.staffMemberships.map((m) => ({
      staffId: m.staffId,
      label: `You at ${m.business.name}`,
      timezone: m.business.timezone,
    })),
  };
}

/** Call after any change to the business, its services or its team. */
export function useRefreshWorkspace() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.workspace });
}
