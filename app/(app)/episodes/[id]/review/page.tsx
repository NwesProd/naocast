import { redirect } from "next/navigation";

// La relecture fait désormais partie du module Montage.
export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/episodes/${id}/montage`);
}
