// Keep complete Tailwind class names here so markup stays focused on content.
export const homeStyles = {
  section: "mt-[35px] [&>h2]:mb-4 [&>h2]:text-base",
  grid: "grid grid-cols-2 gap-5 max-[760px]:gap-3.5 max-[420px]:grid-cols-1",
  card: "rounded-[10px] border border-line bg-white p-[25px] transition-colors duration-150 hover:border-[#a6ae98] max-[760px]:p-5 max-[420px]:p-[22px] [&_h3]:mb-2.5 [&_h3]:text-[17px] [&_h3]:tracking-[-0.3px] [&_p]:max-w-[290px] [&_p]:text-xs [&_p]:leading-[1.8] [&_p]:text-muted",
  icon: "mb-5 grid size-[39px] place-items-center rounded-[9px] border border-line bg-paper text-[#69705e] max-[420px]:mb-3.5",
  cardLink:
    "mt-[25px] flex items-center justify-between text-xs font-semibold max-[420px]:mt-[18px] [&_svg]:w-[17px] [&_svg]:text-[#919887]",
} as const;
