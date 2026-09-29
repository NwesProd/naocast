type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
};

// Bouton naocast. : radius 10px, primaire en #E85A2A avec texte blanc 19px bold
// (contraste exigé par le design system sous 19px sur fond orange).
export function Button({ variant = "primary", className = "", ...props }: Props) {
  const base = "rounded-[10px] px-[22px] py-3 font-bold text-[19px] disabled:opacity-50 transition";
  const styles =
    variant === "primary"
      ? "bg-primary-button text-white hover:brightness-110"
      : "bg-white border border-border text-ink hover:bg-[#FAFAF8]";
  return <button className={`${base} ${styles} ${className}`} {...props} />;
}
