"use client";

import { Label, Select } from "../ui/form";

export interface StaffOption {
  staffId: string;
  label: string;
  timezone: string;
}

/** Choose whose schedule or hours to show; hidden when there's only one choice. */
export function StaffPicker({
  options,
  value,
  onChange,
}: {
  options: StaffOption[];
  value: string;
  onChange: (staffId: string) => void;
}) {
  if (options.length <= 1) {
    return null;
  }
  return (
    <div className="flex max-w-xs flex-col gap-1.5">
      <Label htmlFor="staff-picker">Staff member</Label>
      <Select id="staff-picker" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => (
          <option key={option.staffId} value={option.staffId}>
            {option.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
