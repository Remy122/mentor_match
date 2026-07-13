export default function Pill({ children }) {
  return (
    <span className="inline-flex items-center rounded-full bg-[#fde774] px-3 py-1 text-xs font-bold text-[#2c2455]">
      {children}
    </span>
  );
}
