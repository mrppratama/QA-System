import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

export interface CustomSelectOption {
  value: string;
  label: string;
  sublabel?: string;
  group?: string;
  dotColor?: string;
  badgeClass?: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: CustomSelectOption[];
  placeholder?: string;
  icon?: React.ReactNode;
  size?: 'xs' | 'sm' | 'md';
  variant?: 'default' | 'pill';
  pillClassName?: string;
  className?: string;
  disabled?: boolean;
  align?: 'left' | 'right';
}

export function CustomSelect({
  value,
  onChange,
  options,
  placeholder = 'Pilih...',
  icon,
  size = 'md',
  variant = 'default',
  pillClassName = '',
  className = '',
  disabled = false,
  align = 'left',
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    width: number;
    openUpward: boolean;
  }>({ top: 0, left: 0, width: 200, openUpward: false });

  const selectedOption = options.find(o => o.value === value);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const estimatedHeight = Math.min(options.length * 36 + 16, 260);
    const openUpward = spaceBelow < estimatedHeight && rect.top > estimatedHeight;
    const minMenuWidth = variant === 'pill' ? Math.max(rect.width, 150) : Math.max(rect.width, 180);

    let left = align === 'right' ? rect.right - minMenuWidth : rect.left;
    if (left + minMenuWidth > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - minMenuWidth - 8);
    }

    setCoords({
      top: openUpward ? rect.top - 6 : rect.bottom + 6,
      left,
      width: minMenuWidth,
      openUpward,
    });
  }, [options.length, variant, align]);

  const toggleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    if (!open) {
      updatePosition();
    }
    setOpen(prev => !prev);
  };

  useEffect(() => {
    if (!open) return;
    updatePosition();

    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    const handleScrollOrResize = (e: Event) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) {
        return; // scrolling inside dropdown menu itself
      }
      updatePosition();
    };

    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [open, updatePosition]);

  // Group options if any option has `group`
  const groups: { name: string | null; items: CustomSelectOption[] }[] = [];
  options.forEach(opt => {
    const gName = opt.group || null;
    const last = groups[groups.length - 1];
    if (!last || last.name !== gName) {
      groups.push({ name: gName, items: [opt] });
    } else {
      last.items.push(opt);
    }
  });

  const sizeClasses =
    size === 'xs'
      ? 'px-2.5 py-1.5 text-xs rounded-lg'
      : size === 'sm'
      ? 'px-3 py-2 text-xs rounded-lg'
      : 'px-3 py-2.5 text-sm rounded-lg';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={toggleOpen}
        className={
          variant === 'pill'
            ? `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-[#0ABAB5]/30 ${pillClassName} ${className}`
            : `w-full flex items-center justify-between gap-2 bg-white border text-left transition-all cursor-pointer select-none ${sizeClasses} ${
                open
                  ? 'border-[#0ABAB5] ring-2 ring-[#0ABAB5]/20 bg-white'
                  : 'border-slate-200 hover:border-[#81D8D0] bg-white'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`
        }
      >
        <span className="flex items-center gap-2 min-w-0 flex-1">
          {icon && <span className="text-slate-400 flex-shrink-0">{icon}</span>}
          {selectedOption?.dotColor && (
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: selectedOption.dotColor }}
            />
          )}
          <span
            className={`truncate ${
              variant === 'pill'
                ? ''
                : selectedOption
                ? 'text-slate-800 font-medium'
                : 'text-slate-400'
            }`}
          >
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          {selectedOption?.sublabel && variant !== 'pill' && (
            <span className="text-[11px] text-slate-400 truncate">
              {selectedOption.sublabel}
            </span>
          )}
        </span>

        <svg
          className={`flex-shrink-0 transition-transform duration-150 ${
            variant === 'pill' ? 'w-3 h-3 opacity-70' : 'w-3.5 h-3.5 text-slate-400'
          } ${open ? 'rotate-180 text-[#0ABAB5]' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: coords.openUpward ? undefined : coords.top,
              bottom: coords.openUpward ? window.innerHeight - coords.top : undefined,
              left: coords.left,
              minWidth: coords.width,
              maxWidth: Math.min(window.innerWidth - 16, Math.max(coords.width, 320)),
              zIndex: 9999,
            }}
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-xl border border-slate-200/90 shadow-xl shadow-slate-900/10 py-1.5 max-h-64 overflow-y-auto animate-in fade-in duration-100"
          >
            {options.length === 0 ? (
              <div className="px-3 py-2 text-xs text-slate-400 text-center">
                Tidak ada opsi
              </div>
            ) : (
              groups.map((group, gIdx) => (
                <div key={gIdx}>
                  {group.name && (
                    <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      {group.name}
                    </div>
                  )}
                  {group.items.map(opt => {
                    const isSelected = opt.value === value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          onChange(opt.value);
                          setOpen(false);
                        }}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-left transition-colors ${
                          isSelected
                            ? 'bg-[#f0fbfa] text-[#077d7a] font-semibold'
                            : 'text-slate-700 hover:bg-[#f0fbfa]/60 hover:text-[#077d7a]'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {opt.dotColor && (
                            <span
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: opt.dotColor }}
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate">{opt.label}</p>
                            {opt.sublabel && (
                              <p className="text-[11px] text-slate-400 font-normal truncate mt-0.5">
                                {opt.sublabel}
                              </p>
                            )}
                          </div>
                        </div>
                        {isSelected && (
                          <svg
                            className="w-3.5 h-3.5 text-[#0ABAB5] flex-shrink-0"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2.5}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>,
          document.body
        )}
    </>
  );
}
