import { Button, Typography } from "sud-ui";

export default function SmallButton({ children, className = "", ...props }) {
  return (
    <Button
      size="sm"
      color="black-10"
      background="transparent"
      border={false}
      {...props}
      className={`disabled:opacity-50 ${className}`.trim()}
    >
      <Typography size="xs" className="underline">{children}</Typography>
    </Button>
  );
}
