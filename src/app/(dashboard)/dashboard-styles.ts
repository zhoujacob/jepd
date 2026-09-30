// Keep complete Tailwind class names here so markup stays focused on content.
export const dashboardStyles = {
  shell: "flex min-h-dvh max-[760px]:block",
  skipLink:
    "fixed -top-[100px] left-5 z-5 rounded-[5px] bg-gold p-3 focus:top-3",
  content: "flex min-w-0 flex-1 flex-col",
  header:
    "flex min-h-[77px] items-center justify-between gap-5 border-b border-line bg-white px-[42px] py-5 text-xs text-[#71756a] max-[1050px]:px-7 max-[760px]:min-h-[55px] max-[760px]:px-5 max-[760px]:py-[15px] max-[760px]:text-[10px] max-[420px]:text-[9px]",
  separator: "mx-2.5 text-[#c5c8be] max-[760px]:mx-[5px]",
  workspaceLabel:
    "flex items-center gap-[7px] text-[11px] whitespace-nowrap max-[760px]:hidden [&>span]:size-1.5 [&>span]:rounded-full [&>span]:bg-[#658365]",
  main: "mx-auto w-full max-w-[1240px] flex-1 px-[42px] pt-[43px] pb-16 min-[1440px]:pt-[54px] max-[1050px]:px-7 max-[1050px]:pt-[34px] max-[1050px]:pb-12 max-[760px]:px-5 max-[760px]:pt-7 max-[760px]:pb-11",
  footer:
    "flex justify-between gap-3.5 border-t border-line px-[42px] py-5 text-[10px] text-[#8b8f83] max-[1050px]:px-7 max-[1050px]:[&>span]:hidden max-[760px]:px-5 max-[760px]:text-[9px]",
} as const;
