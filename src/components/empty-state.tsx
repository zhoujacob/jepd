import { Icon } from "./icon";

export function EmptyState({ type }: { type: "tournaments" | "sessions" }) {
  return (
    <section
      className="flex min-h-[390px] flex-col items-center justify-center rounded-xl border border-line bg-white px-5 py-10 text-center max-[760px]:min-h-[340px] [&_h2]:mb-3 [&_h2]:text-[19px] [&_p]:text-[13px] [&_p]:leading-[1.85] [&_p]:text-muted"
      aria-labelledby="empty-title"
    >
      <span className="mb-[22px] grid size-16 place-items-center rounded-2xl border border-[#e9ecdf] bg-[#f4f5ee] text-[#89927a] [&_svg]:size-[27px]">
        <Icon name={type} />
      </span>
      <h2 id="empty-title">No {type} yet</h2>
      <p>
        {type === "tournaments"
          ? "Club tournaments will have a home here."
          : "Club pickleball sessions will have a home here."}
        <br />
        There’s nothing to show right now.
      </p>
    </section>
  );
}
