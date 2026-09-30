// Keep complete Tailwind class names here so markup stays focused on content.
export const sidebarStyles = {
  logoutButton:
    "flex w-full items-center gap-2.5 rounded-md border-0 bg-transparent p-2.5 text-xs text-[#64695f] hover:bg-paper max-[760px]:gap-[5px] max-[760px]:p-2 max-[760px]:text-[11px] [&_svg]:w-4",
  sidebar:
    "sticky top-0 flex h-dvh w-[248px] shrink-0 flex-col border-r border-line bg-white px-5 pt-8 pb-5 max-[1050px]:w-[220px] max-[1050px]:px-4 max-[760px]:static max-[760px]:grid max-[760px]:h-auto max-[760px]:w-full max-[760px]:grid-cols-[1fr_auto] max-[760px]:gap-x-2.5 max-[760px]:gap-y-5 max-[760px]:border-r-0 max-[760px]:border-b max-[760px]:px-5 max-[760px]:pt-[19px] max-[760px]:pb-3 max-[760px]:[--brand-width:150px] max-[420px]:px-4",
  heading:
    "mx-3 mt-[49px] mb-3.5 text-[10px] font-bold tracking-[1.4px] text-[#81857b] max-[760px]:hidden",
  navigation:
    'flex flex-col gap-1.5 max-[760px]:col-span-full max-[760px]:row-start-2 max-[760px]:grid max-[760px]:grid-cols-3 max-[760px]:gap-[7px] max-[760px]:has-[a[href="/execs"]]:grid-cols-2',
  accountArea:
    "mt-auto pt-7 max-[760px]:col-span-full max-[760px]:row-start-3 max-[760px]:m-0 max-[760px]:flex max-[760px]:items-center max-[760px]:justify-between max-[760px]:gap-3 max-[760px]:p-0",
  profile:
    "flex items-center gap-2.5 border-t border-line px-[3px] pt-[21px] pb-[17px] max-[760px]:hidden [&>div]:min-w-0 [&_strong]:text-xs [&_strong]:font-semibold",
  avatar:
    "grid size-[33px] shrink-0 place-items-center rounded-full border border-line bg-[#eef0e9] text-xs font-bold text-green",
  email:
    "mt-1 block text-[11px] leading-normal text-muted [overflow-wrap:anywhere]",
  navigationLink:
    "flex items-center gap-[13px] rounded-[7px] px-3.5 py-[13px] font-medium text-[#656a60] hover:bg-paper aria-[current=page]:bg-[#fcf3cf] aria-[current=page]:font-semibold aria-[current=page]:text-[#35301a] aria-[current=page]:[&_svg]:text-[#897020] max-[760px]:justify-center max-[760px]:gap-2 max-[760px]:px-2 max-[760px]:py-[11px] max-[760px]:text-xs max-[760px]:[&_svg]:w-[17px]",
} as const;
