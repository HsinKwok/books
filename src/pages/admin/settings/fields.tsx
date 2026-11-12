/** 设置页的下拉：选项少且样式统一，抽出来避免重复书写 */
export function Select({
  name,
  value,
  options,
}: {
  name: string;
  value: string;
  options: { value: string; label: string }[];
}) {
  return (
    <select name={name}>
      {options.map((opt) => (
        <option value={opt.value} selected={value === opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
