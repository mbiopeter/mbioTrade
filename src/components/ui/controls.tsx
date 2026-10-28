"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

export type FieldProps = {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
};

export function Field({ label, hint, error, children }: FieldProps) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`input ${className}`.trim()} />;
}

export type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
};

export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: SwitchProps) {
  return (
    <button
      type="button"
      className={`switch ${checked ? "on" : ""}`}
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      disabled={disabled}
    >
      <span />
      {label && <em>{label}</em>}
    </button>
  );
}

export type SegmentedOption<T extends string | number> = {
  value: T;
  label: string;
  hint?: string;
};

export type SegmentedProps<T extends string | number> = {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
};

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
}: SegmentedProps<T>) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          className={value === option.value ? "active" : ""}
          onClick={() => onChange(option.value)}
          title={option.hint}
          aria-pressed={value === option.value}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export type SearchOption = {
  value: string;
  label: string;
  meta?: string;
};

export type SearchSelectProps = {
  value: string;
  options: SearchOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
};

export function SearchSelect({
  value,
  options,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Filter…",
  disabled = false,
}: SearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (
        rootRef.current &&
        !rootRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const selected = options.find((option) => option.value === value);
  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return options;
    }

    return options.filter((option) =>
      `${option.label} ${option.value} ${option.meta ?? ""}`
        .toLowerCase()
        .includes(normalized),
    );
  }, [options, query]);

  const choose = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="search-select" ref={rootRef}>
      <button
        type="button"
        className="input search-select-trigger"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span>{selected?.label ?? placeholder}</span>
        <ChevronDown size={15} />
      </button>

      {open && (
        <div className="search-select-pop">
          <div className="search-select-search">
            <Search size={14} />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
            />
          </div>

          <div className="search-select-list" role="listbox">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  key={option.value}
                  className={option.value === value ? "selected" : ""}
                  onClick={() => choose(option.value)}
                >
                  <span>
                    <strong>{option.label}</strong>
                    {option.meta && <small>{option.meta}</small>}
                  </span>
                  {option.value === value && <Check size={14} />}
                </button>
              ))
            ) : (
              <div className="search-select-empty">No matches</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
