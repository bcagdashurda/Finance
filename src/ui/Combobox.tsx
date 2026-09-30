import { useState, type ReactNode } from 'react';
import { Popover } from 'radix-ui';
import { Command } from 'cmdk';
import { CaretUpDown, Check, Plus } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from './cn';
import { searchScore } from '@/domain/search';

export interface ComboOption {
  value: string;
  label: string;
  hint?: ReactNode;
  icon?: ReactNode;
  group?: string;
  keywords?: string[];
}

interface ComboboxProps {
  id?: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  options: ComboOption[];
  placeholder: string;
  searchPlaceholder?: string;
  emptyText?: string;
  onCreate?: (query: string) => void;
  createLabel?: (query: string) => string;
  allowClear?: boolean;
  invalid?: boolean;
}

/** Aranabilir seçim kutusu (cmdk + Radix Popover). */
export function Combobox({
  id,
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder = 'Ara…',
  emptyText = 'Sonuç yok',
  onCreate,
  createLabel = (q) => `“${q}” oluştur`,
  allowClear,
  invalid,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((o) => o.value === value);
  const groups = [...new Set(options.map((o) => o.group ?? ''))];

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          id={id}
          type="button"
          aria-invalid={invalid || undefined}
          className={cn(
            'flex h-10 w-full items-center gap-2.5 rounded-[var(--radius-control)] border border-line-strong bg-surface px-3.5 text-left text-sm transition-[border-color,box-shadow]',
            'hover:border-[color-mix(in_oklab,var(--cobalt)_35%,var(--line-strong))] data-[state=open]:border-cobalt data-[state=open]:shadow-[0_0_0_3px_color-mix(in_oklab,var(--cobalt)_18%,transparent)]',
            'aria-[invalid=true]:border-outflow',
          )}
        >
          {selected?.icon}
          <span className={cn('min-w-0 flex-1 truncate', !selected && 'text-faint')}>{selected?.label ?? placeholder}</span>
          <CaretUpDown size={14} className="shrink-0 text-muted" />
        </button>
      </Popover.Trigger>
      <AnimatePresence>
        {open && (
          <Popover.Portal forceMount>
            <Popover.Content asChild align="start" sideOffset={6} forceMount>
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                transition={{ duration: 0.16, ease: [0.25, 1, 0.5, 1] }}
                className="z-[70] w-[var(--radix-popover-trigger-width)] min-w-64 overflow-hidden rounded-[14px] border border-line bg-surface shadow-[var(--float-shadow)]"
              >
                <Command
                  loop
                  // Değerin \u0001 sonrası (kimlik) aramaya katılmaz; "oluştur" satırı her zaman en altta
                  filter={(value, search, keywords) =>
                    value.startsWith('__create__') ? 0.01 : value === '__clear__' ? (search ? 0 : 1) : searchScore(value.split('\u0001')[0]!, search, keywords)
                  }
                >
                  <Command.Input
                    value={query}
                    onValueChange={setQuery}
                    placeholder={searchPlaceholder}
                    className="h-11 w-full border-b border-line bg-transparent px-3.5 text-sm outline-none placeholder:text-faint"
                  />
                  <Command.List className="scrollbar-thin max-h-72 overflow-y-auto p-1.5">
                    <Command.Empty className="px-3 py-6 text-center text-xs text-muted">{emptyText}</Command.Empty>
                    {allowClear && value && (
                      <Command.Item
                        value="__clear__"
                        onSelect={() => {
                          onChange(undefined);
                          setOpen(false);
                        }}
                        className="flex cursor-pointer items-center rounded-[10px] px-2.5 py-2 text-xs text-muted data-[selected=true]:bg-sunken"
                      >
                        Seçimi kaldır
                      </Command.Item>
                    )}
                    {groups.map((g) => (
                      <Command.Group
                        key={g}
                        heading={g || undefined}
                        className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:text-faint"
                      >
                        {options
                          .filter((o) => (o.group ?? '') === g)
                          .map((o) => (
                            <Command.Item
                              key={o.value}
                              value={`${o.label}\u0001${o.value}`}
                              keywords={o.keywords}
                              onSelect={() => {
                                onChange(o.value);
                                setOpen(false);
                                setQuery('');
                              }}
                              className="flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-sm data-[selected=true]:bg-sunken"
                            >
                              {o.icon}
                              <span className="min-w-0 flex-1 truncate">{o.label}</span>
                              {o.hint && <span className="shrink-0 text-2xs text-muted">{o.hint}</span>}
                              {o.value === value && <Check size={14} className="shrink-0 text-cobalt" />}
                            </Command.Item>
                          ))}
                      </Command.Group>
                    ))}
                    {onCreate && query.trim().length > 1 && (
                      <Command.Item
                        value={`__create__ ${query}`}
                        onSelect={() => {
                          onCreate(query.trim());
                          setOpen(false);
                          setQuery('');
                        }}
                        className="mt-1 flex cursor-pointer items-center gap-2 rounded-[10px] border border-dashed border-line-strong px-2.5 py-2 text-sm text-cobalt-ink data-[selected=true]:bg-cobalt-soft"
                      >
                        <Plus size={14} weight="bold" />
                        {createLabel(query.trim())}
                      </Command.Item>
                    )}
                  </Command.List>
                </Command>
              </motion.div>
            </Popover.Content>
          </Popover.Portal>
        )}
      </AnimatePresence>
    </Popover.Root>
  );
}
