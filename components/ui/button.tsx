import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-sm border border-transparent px-4 py-2 font-body text-sm font-semibold transition-[background-color,color,border-color,transform] disabled:pointer-events-none disabled:opacity-45 [&_svg]:h-4 [&_svg]:w-4",
  {
    variants: {
      variant: {
        default: "border-ochre bg-ochre text-primary-foreground hover:bg-ochre/85",
        destructive: "border-brick bg-transparent text-brick hover:bg-brick hover:text-paper-surface",
        outline: "border-ink/40 bg-transparent text-ink hover:border-ink hover:bg-paper-surface",
        secondary: "border-ink/10 bg-paper-deep text-ink hover:border-ink/30",
        ghost: "text-ink hover:bg-paper-deep/70",
        text: "h-auto border-0 bg-transparent px-1 py-0 text-ink decoration-ochre underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-sm px-3 text-xs",
        lg: "h-11 rounded-sm px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
