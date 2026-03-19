"use client";

import React, {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

const DEBOUNCE_MS = 300;
const ARTISTS_API = "/api/artists";

export interface ArtistOption {
  id: string;
  name: string;
}

export interface ArtistComboboxValue {
  id: string | null;
  name: string;
}

interface ArtistComboboxProps {
  value: ArtistComboboxValue;
  onChange: (value: ArtistComboboxValue) => void;
  placeholder?: string;
  /** Light theme (dark text on light bg) vs dark (light text on dark bg). */
  isLight?: boolean;
  id?: string;
  "aria-label"?: string;
  className?: string;
}

export function ArtistCombobox({
  value,
  onChange,
  placeholder = "e.g., Hector Duarte",
  isLight = true,
  id: propId,
  "aria-label": ariaLabel = "Artist",
  className = "",
}: ArtistComboboxProps) {
  const generatedId = useId();
  const id = propId ?? `artist-combobox-${generatedId.replace(/:/g, "")}`;
  const listboxId = `${id}-listbox`;

  const [inputValue, setInputValue] = useState(value.name);
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ArtistOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncInputToValue = useCallback(() => {
    setInputValue(value.name);
  }, [value.name]);

  useEffect(() => {
    syncInputToValue();
  }, [syncInputToValue]);

  useEffect(() => {
    if (!isOpen || !inputValue.trim()) {
      setOptions([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      setLoading(true);
      fetch(`${ARTISTS_API}?q=${encodeURIComponent(inputValue.trim())}`)
        .then((res) => (res.ok ? res.json() : []))
        .then((data: ArtistOption[]) => {
          setOptions(Array.isArray(data) ? data : []);
          setHighlightedIndex(-1);
        })
        .catch(() => setOptions([]))
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [isOpen, inputValue]);

  const selectOption = useCallback(
    (option: ArtistOption) => {
      onChange({ id: option.id, name: option.name });
      setInputValue(option.name);
      setIsOpen(false);
      setHighlightedIndex(-1);
      inputRef.current?.focus();
    },
    [onChange]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setInputValue(v);
    onChange({ id: null, name: v });
    setIsOpen(true);
  };

  const handleInputFocus = () => {
    if (inputValue.trim()) setIsOpen(true);
  };

  const handleInputBlur = () => {
    setTimeout(() => setIsOpen(false), 150);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((i) =>
          i < options.length - 1 ? i + 1 : i
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((i) => (i > 0 ? i - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && options[highlightedIndex]) {
          selectOption(options[highlightedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
      default:
        break;
    }
  };

  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const el = listRef.current.children[highlightedIndex] as HTMLElement;
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex]);

  const inputClass = isLight
    ? "border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-400 focus:border-amber-500 focus:ring-amber-500/20"
    : "border-white/30 bg-white/10 text-white placeholder:text-white/50 focus:border-amber-500 focus:ring-amber-500/20";
  const listClass = isLight
    ? "border-zinc-200 bg-white text-zinc-900"
    : "border-white/20 bg-white/10 text-white";

  return (
    <div className={`relative ${className}`}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-activedescendant={
          isOpen && highlightedIndex >= 0 && options[highlightedIndex]
            ? `${id}-option-${highlightedIndex}`
            : undefined
        }
        aria-label={ariaLabel}
        className={`w-full rounded-lg border px-3 py-2 text-mobile-body focus:outline-none focus:ring-2 ${inputClass}`}
        autoComplete="off"
      />
      {isOpen && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          className={`absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-auto rounded-lg border py-1 shadow-lg ${listClass}`}
        >
          {loading && (
            <li
              className="px-3 py-2 text-sm opacity-70"
              role="status"
              aria-live="polite"
            >
              Searching…
            </li>
          )}
          {!loading && options.length === 0 && inputValue.trim() && (
            <li className="px-3 py-2 text-sm opacity-70" role="status">
              No matches — type to add as new artist
            </li>
          )}
          {!loading &&
            options.map((opt, i) => (
              <li
                key={opt.id}
                id={`${id}-option-${i}`}
                role="option"
                aria-selected={highlightedIndex === i}
                className={`cursor-pointer px-3 py-2 text-mobile-body ${
                  highlightedIndex === i
                    ? isLight
                      ? "bg-amber-100 text-zinc-900"
                      : "bg-white/20"
                    : isLight
                      ? "hover:bg-zinc-100"
                      : "hover:bg-white/10"
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectOption(opt);
                }}
              >
                {opt.name}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
