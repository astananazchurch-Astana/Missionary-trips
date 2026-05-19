type LogoProps = {
  className: string;
};

export function Logo({ className }: LogoProps) {
  return <img className={className} src={`${import.meta.env.BASE_URL}logo.png`} alt="" />;
}
