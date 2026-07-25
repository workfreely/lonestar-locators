import Switch from "./Switch"

export default function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-2.5">
      <span className="text-[13.5px] font-medium text-[#111318]">{label}</span>
      <Switch checked={checked} onChange={onChange} />
    </label>
  )
}
