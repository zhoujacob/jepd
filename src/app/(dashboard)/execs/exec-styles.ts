// Keep complete Tailwind class names here so markup stays focused on content.
export const execStyles = {
  addForm:
    "mt-[22px] [&_label]:mb-[9px] [&_label]:block [&_label]:text-xs [&_label]:font-semibold [&_.form-error]:mt-3",
  fields:
    "flex items-end gap-3 max-[760px]:flex-col max-[760px]:items-stretch [&_button]:shrink-0",
  emailField: "min-w-0 flex-1",
  input:
    "min-h-11 w-full rounded-md border border-[#dce0d4] bg-white p-3 text-sm text-ink placeholder:text-[#a0a396]",
  addButton:
    "flex min-h-[45px] items-center justify-center gap-2.5 rounded-md border border-[#e4bf3e] bg-gold px-[15px] py-3 text-[13px] font-semibold text-[#312b13] hover:bg-[#edc437]",
  help: "mt-2.5 text-xs leading-[1.7] text-muted",
  success: "mt-3 text-[13px] text-green",
  removeForm: "max-w-60",
  removeButton:
    "min-h-11 rounded-md border border-line bg-white px-3 py-2.5 whitespace-nowrap text-[#9b3a27] hover:bg-[#fff2ee]",
  panel:
    "mb-[22px] rounded-xl border border-line bg-white p-[26px] max-[760px]:p-5 [&_h2]:text-lg",
  accountList:
    "mt-5 list-none p-0 [&_li]:flex [&_li]:items-center [&_li]:justify-between [&_li]:gap-[18px] [&_li]:border-t [&_li]:border-line [&_li]:py-[18px] max-[760px]:[&_li]:flex-col max-[760px]:[&_li]:items-stretch",
  accountDetails:
    "min-w-0 [&_strong]:block [&_strong]:text-[13px] [&_strong]:[overflow-wrap:anywhere] [&_span]:mt-1.5 [&_span]:block [&_span]:text-xs [&_span]:text-muted",
} as const;
