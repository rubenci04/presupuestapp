"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { formatNumber, parseDecimal } from "@/lib/format";
import { cn } from "@/lib/utils";

interface DecimalInputProps extends Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type"> {
  value: number | null;
  onValueChange: (value: number | null) => void;
}

/** Input numérico en formato argentino. Guarda lo tipeado tal cual mientras tiene foco
 *  y lo reformatea al salir, para no mover el cursor mientras se escribe. */
export function DecimalInput({ value, onValueChange, className, onBlur, onFocus, ...props }: DecimalInputProps) {
  const [text, setText] = useState(value === null ? "" : formatNumber(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(value === null ? "" : formatNumber(value));
  }, [value, focused]);

  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      className={cn("money", className)}
      value={text}
      onFocus={(event) => {
        setFocused(true);
        event.target.select();
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      onChange={(event) => {
        setText(event.target.value);
        onValueChange(parseDecimal(event.target.value));
      }}
    />
  );
}
