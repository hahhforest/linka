import { selectActiveRoomSnapshot, useRoomStore } from "../../store/roomStore.js";

const memberAccent = (kind: string): string => (kind === "agent" ? "bg-linka" : "bg-signal");

export const MemberRail = () => {
  const snapshot = useRoomStore(selectActiveRoomSnapshot);

  return (
    <aside className="border-t border-line bg-[#f3efe6]/95 p-4 lg:border-l lg:border-t-0 lg:p-5">
      <section>
        <p className="font-mono text-xs uppercase text-linka">member rail</p>
        <h2 className="mt-1 text-lg font-semibold">现场成员</h2>
        <div className="mt-4 grid gap-2">
          {snapshot.members.map((member) => (
            <article key={member.id} className="rounded-lg border border-line bg-panel p-3">
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white ${memberAccent(member.kind)}`}
                >
                  {member.displayName.slice(0, 1)}
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold">{member.displayName}</h3>
                  <p className="font-mono text-xs text-muted">
                    {member.kind} · {member.role}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-md border border-line bg-paper px-2 py-1 text-xs text-muted">
                  {member.status}
                </span>
                <span className="rounded-md border border-line bg-paper px-2 py-1 text-xs text-muted">
                  {member.permissions.canManageMembers ? "可管理" : "可协作"}
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>

      {snapshot.announcements.length > 0 ? (
        <section className="mt-6 border-t border-line pt-5">
          <h2 className="text-sm font-semibold">公告板</h2>
          <div className="mt-3 grid gap-2">
            {snapshot.announcements.map((announcement) => (
              <article key={announcement.id} className="rounded-lg border border-line bg-panel p-3">
                <h3 className="text-sm font-semibold">{announcement.title ?? "公告"}</h3>
                <p className="mt-2 break-words text-sm leading-5 text-muted">{announcement.body}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </aside>
  );
};
