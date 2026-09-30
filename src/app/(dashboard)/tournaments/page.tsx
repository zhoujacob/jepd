import { requireExec } from "@/lib/auth";
import { EmptyState } from "@/components/empty-state";

export const metadata = { title: "Tournaments" };

export default async function TournamentsPage() {
  await requireExec();
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">CLUB WORKSPACE</p>
        <h1>Tournaments</h1>
        <p>A place for club tournaments and competition.</p>
      </div>
      <EmptyState type="tournaments" />
    </>
  );
}
