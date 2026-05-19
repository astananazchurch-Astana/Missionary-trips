type LogoProps = {
  className: string;
};

export function Logo({ className }: LogoProps) {
  return <img className={className} src="/logo.png" alt="" />;
}
