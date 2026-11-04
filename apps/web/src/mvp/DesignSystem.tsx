import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { X, ShieldCheck } from "lucide-react";

export function Tabs({
  items,
  value,
  onChange,
  label,
  panelId,
}: {
  items: string[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  panelId?: string;
}) {
  const id = useId();
  return (
    <div className="mvp-tabs" role="tablist" aria-label={label}>
      {items.map((item, index) => (
        <button
          key={item}
          id={`${panelId || id}-tab-${index}`}
          aria-controls={panelId}
          type="button"
          role="tab"
          aria-selected={value === item}
          tabIndex={value === item ? 0 : -1}
          className={value === item ? "active" : ""}
          onClick={() => onChange(item)}
          onKeyDown={(e) => {
            let next: number;
            if (e.key === "ArrowRight") next = (index + 1) % items.length;
            else if (e.key === "ArrowLeft") next = (index + items.length - 1) % items.length;
            else if (e.key === "Home") next = 0;
            else if (e.key === "End") next = items.length - 1;
            else return;
            e.preventDefault();
            onChange(items[next]);
            e.currentTarget.parentElement
              ?.querySelectorAll<HTMLButtonElement>("button")
              .item(next)
              ?.focus();
          }}
        >
          {item}
        </button>
      ))}
    </div>
  );
}
export function Unavailable({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mvp-unavailable">
      <ShieldCheck size={24} />
      <span className="eyebrow">NOT AVAILABLE YET</span>
      <h2>{title}</h2>
      <p>{children}</p>
    </section>
  );
}
export function DataTable({
  caption,
  headings,
  children,
}: {
  caption: string;
  headings: string[];
  children: ReactNode;
}) {
  return (
    <div className="mvp-table-scroll" tabIndex={0} role="region" aria-label={caption}>
      <table className="mvp-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            {headings.map((h) => (
              <th scope="col" key={h}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export function Toast({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return open ? (
    <div className="mvp-toast" role="status">
      <span>{children}</span>
      <button
        type="button"
        className="icon-button"
        aria-label="Dismiss notification"
        onClick={() => setOpen(false)}
      >
        <X size={18} />
      </button>
    </div>
  ) : null;
}
type Prompt = { title: string; description: string; action: string };
const ConfirmContext = createContext<(prompt: Prompt) => Promise<boolean>>(() =>
  Promise.resolve(false),
);
export const useConfirm = () => useContext(ConfirmContext);
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const resolve = useRef<((value: boolean) => void) | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const title = useId();
  const close = (value: boolean) => {
    dialog.current?.close();
    setPrompt(null);
    resolve.current?.(value);
    resolve.current = null;
    trigger.current?.focus();
  };
  useEffect(() => {
    if (prompt) dialog.current?.showModal();
  }, [prompt]);
  useEffect(
    () => () => {
      resolve.current?.(false);
    },
    [],
  );
  return (
    <ConfirmContext.Provider
      value={(request) =>
        new Promise<boolean>((done) => {
          resolve.current?.(false);
          trigger.current = document.activeElement as HTMLElement;
          resolve.current = done;
          setPrompt(request);
        })
      }
    >
      {children}
      <dialog
        className="mvp-dialog"
        ref={dialog}
        aria-labelledby={title}
        onCancel={(e) => {
          e.preventDefault();
          close(false);
        }}
      >
        {prompt && (
          <>
            <span className="eyebrow">CONFIRM ACTION</span>
            <h2 id={title}>{prompt.title}</h2>
            <p>{prompt.description}</p>
            <div className="mvp-dialog-actions">
              <button
                autoFocus
                type="button"
                className="button outline"
                onClick={() => close(false)}
              >
                CANCEL
              </button>
              <button type="button" className="button primary" onClick={() => close(true)}>
                {prompt.action}
              </button>
            </div>
          </>
        )}
      </dialog>
    </ConfirmContext.Provider>
  );
}
