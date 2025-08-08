import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "destructive" | "ghost";
  size?: "default" | "sm" | "lg";
}

const variantClasses = {
  default: "bg-blue-600 text-white hover:bg-blue-700",
  outline:
    "border border-gray-300 bg-white text-gray-900 hover:bg-gray-100 hover:text-blue-600",
  destructive: "bg-red-600 text-white hover:bg-red-700",
  ghost: "bg-transparent hover:bg-gray-100 text-gray-900",
};

const sizeClasses = {
  default: "h-10 px-4 py-2 text-base",
  sm: "h-8 px-3 py-1 text-sm",
  lg: "h-12 px-6 py-3 text-lg",
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "default",
      type = "button",
      ...props
    },
    ref
  ) => {
    return (
      <button
        type={type}
        className={cn(
          "inline-flex items-center justify-center rounded-lg font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none",
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
