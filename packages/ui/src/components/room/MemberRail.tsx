import { useRoomStore } from "../../store/roomStore.js";

const emptyMembers = [] as const;
const emptyAnnouncements = [] as const;
const emptyDocs = [] as const;

const memberAccent = (kind: string): string => (kind === "agent" ? "bg-linka" : "bg-signal");

const formatDocUpdatedAt = (updatedAt: number): string =>
  new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(updatedAt));

const getBodyFirstLine = (body: string): string | undefined =>
  body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

export const MemberRail = () => {
  const activeRoomId = useRoomStore((state) => state.activeRoomId);
  const members = useRoomStore((state) =>
    activeRoomId ? (state.membersByRoomId[activeRoomId] ?? emptyMembers) : emptyMembers,
  );
  const docs = useRoomStore((state) =>
    activeRoomId ? (state.docsByRoomId[activeRoomId] ?? emptyDocs) : emptyDocs,
  );
  const announcements = useRoomStore((state) =>
    activeRoomId
      ? (state.announcementsByRoomId[activeRoomId] ?? emptyAnnouncements)
      : emptyAnnouncements,
  );

  return (
    <aside className="border-t border-line bg-[#f3efe6]/95 p-4 lg:border-l lg:border-t-0 lg:p-5">
      <section>
        <p className="font-mono text-xs uppercase text-linka">member rail</p>
        <h2 className="mt-1 text-lg font-semibold">现场成员</h2>
        <div className="mt-4 grid gap-2">
          {members.map((member) => (
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

      <section className="mt-6 border-t border-line pt-5">
        <h2 className="text-sm font-semibold">协作文档</h2>
        {docs.length > 0 ? (
          <div className="mt-3 grid gap-2">
            {docs.map((doc) => {
              const firstLine = getBodyFirstLine(doc.body);

              return (
                <article key={doc.id} className="rounded-lg border border-line bg-panel p-3">
                  <h3 className="truncate text-sm font-semibold">{doc.title}</h3>
                  <p className="mt-1 font-mono text-xs text-muted">
                    {doc.format} · {doc.status}
                  </p>
                  {firstLine ? (
                    <p className="mt-2 break-words text-sm leading-5 text-muted">{firstLine}</p>
                  ) : (
                    <time
                      className="mt-2 block font-mono text-xs text-muted"
                      dateTime={new Date(doc.updatedAt).toISOString()}
                    >
                      更新于 {formatDocUpdatedAt(doc.updatedAt)}
                    </time>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-line bg-panel/70 p-3 text-sm text-muted">
            暂无协作文档
          </p>
        )}
      </section>

      {announcements.length > 0 ? (
        <section className="mt-6 border-t border-line pt-5">
          <h2 className="text-sm font-semibold">公告板</h2>
          <div className="mt-3 grid gap-2">
            {announcements.map((announcement) => (
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
