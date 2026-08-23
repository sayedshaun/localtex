import { useEffect, useRef, useState } from "react";

type MenuItem = {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
};

type Menu = {
  label: string;
  items: MenuItem[];
};

function MenuDropdown({
  menu,
  open,
  anyOpen,
  onOpen,
  onClose,
}: {
  menu: Menu;
  open: boolean;
  anyOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  return (
    <div className="menu-dropdown">
      <button
        className={"menu-trigger" + (open ? " open" : "")}
        onClick={() => (open ? onClose() : onOpen())}
        onMouseEnter={() => {
          if (anyOpen && !open) onOpen();
        }}
      >
        {menu.label}
      </button>
      {open && (
        <div className="menu-list">
          {menu.items.map((item) => (
            <button
              key={item.label}
              className="menu-item"
              disabled={item.disabled}
              onClick={() => {
                item.onSelect();
                onClose();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MenuBar({ menus }: { menus: Menu[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (openIndex === null) return;
    const close = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpenIndex(null);
      }
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [openIndex]);

  return (
    <div className="menu-bar" ref={rootRef}>
      {menus.map((menu, i) => (
        <MenuDropdown
          key={menu.label}
          menu={menu}
          open={openIndex === i}
          anyOpen={openIndex !== null}
          onOpen={() => setOpenIndex(i)}
          onClose={() => setOpenIndex(null)}
        />
      ))}
    </div>
  );
}

export type { Menu, MenuItem };
