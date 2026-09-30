// Keep complete Tailwind class names here so markup stays focused on content.
export const loginStyles = {
  page: "flex min-h-dvh flex-col items-center bg-paper bg-[radial-gradient(ellipse_at_50%_10%,#f1f0e3,transparent_60%)] px-6 pt-12 pb-6 max-[760px]:pt-[35px]",
  brand: "mb-[58px] [--brand-width:280px] max-[760px]:mb-[35px]",
  card: "w-full max-w-[420px] rounded-[14px] border border-line bg-white p-[38px] shadow-[0_10px_35px_#303c2505] max-[760px]:p-[29px]",
  help: "mt-[26px] text-center text-[11px] leading-[1.9] text-[#898c81]",
  footer: "mt-9 text-[10px] text-[#93978a]",
  form: "mt-[29px] flex flex-col",
  googleButton:
    "flex min-h-11 items-center justify-center rounded border border-[#747775] bg-white px-5 py-3 text-sm font-medium text-[#1f1f1f] hover:bg-[#f2f2f2]",
} as const;
