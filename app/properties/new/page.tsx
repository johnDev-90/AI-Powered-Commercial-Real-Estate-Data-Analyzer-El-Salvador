import type { Metadata } from "next";
import { PropertyForm } from "@/components/property-form";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "New property" };

export default function NewPropertyPage() {
  return (
    <>
      <PageHeader title="New property" description="Fields marked * are required. The record is checked by the data quality rules after saving." />
      <div className="max-w-4xl"><PropertyForm /></div>
    </>
  );
}
