export default function Pill({ children }) {
  return (
    <span className="inline-flex items-center rounded-full bg-[#dcbc98] px-3 py-1 text-xs font-bold text-[#0c0a08]">
      {children}
    </span>
  );
}
