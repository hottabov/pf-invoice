import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { isAdminRole } from "@/lib/roles";
import { getConflictGroupDetail } from "@/lib/queries/conflict-groups";
import { listOptionsForConflictGroups } from "@/lib/queries/catalog";
import {
  updateConflictGroupName,
  deleteConflictGroup,
  setConflictGroupMembers,
} from "@/lib/actions/catalog";
import { ConflictGroupForm } from "@/components/settings/conflict-group-form";
import { ConflictGroupMembersEditor } from "@/components/settings/conflict-group-members-editor";
import { DeleteButton } from "@/components/catalog/delete-button";
import { PageHeader, SectionCard } from "@/components/ui-kit";

export const dynamic = "force-dynamic";

type Params = { groupId: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { groupId } = await params;
  const group = await getConflictGroupDetail(groupId);
  return { title: group ? group.name : "Conflict group" };
}

export default async function ConflictGroupPage({ params }: { params: Promise<Params> }) {
  const { groupId } = await params;
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) notFound();

  const [group, options] = await Promise.all([
    getConflictGroupDetail(groupId),
    listOptionsForConflictGroups(),
  ]);
  if (!group) notFound();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader backHref="/settings/option-conflict-groups" backLabel="Option conflict groups" title={group.name} />

      <SectionCard title="Name">
        <ConflictGroupForm
          action={updateConflictGroupName.bind(null, group.id)}
          defaultValue={group.name}
          submitLabel="Save changes"
        />
      </SectionCard>

      <SectionCard
        title="Members"
        description="Options in this group can never be selected together on the same item. A group with fewer than two members blocks nothing."
      >
        <ConflictGroupMembersEditor
          groupId={group.id}
          options={options}
          initialSelected={group.memberIds}
          action={setConflictGroupMembers}
        />
      </SectionCard>

      <SectionCard
        tone="danger"
        title="Danger zone"
        description="Deleting a group removes its membership rows. Options that were only blocked by this group become selectable together again — a quote that already has both keeps its lines either way."
      >
        <DeleteButton
          action={deleteConflictGroup.bind(null, group.id)}
          confirmTitle={`Delete "${group.name}"?`}
          confirmDescription="This removes its membership rows. This can't be undone."
          label="Delete group"
        />
      </SectionCard>
    </div>
  );
}
