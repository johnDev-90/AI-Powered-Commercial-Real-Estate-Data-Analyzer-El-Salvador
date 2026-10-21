import { ButtonLink, EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <EmptyState
      title="Not found"
      description="The record you are looking for does not exist or was removed."
      action={<ButtonLink href="/properties">Back to properties</ButtonLink>}
    />
  );
}
