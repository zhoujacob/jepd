"use client";

import { useId, useState, type ReactNode } from "react";
import { sessionStyles as styles } from "./session-styles";

const tabs = ["This week", "Weekly schedule", "My usual availability"];

export function ScheduleTabs({
  children,
  weekly,
  availability,
}: {
  children: ReactNode;
  weekly: ReactNode;
  availability: ReactNode;
}) {
  const id = useId();
  const [selected, setSelected] = useState(0);

  return (
    <div className={styles.section}>
      <div role="tablist" aria-label="Session schedule" className={styles.tabs}>
        {tabs.map((label, index) => (
          <button
            key={label}
            type="button"
            role="tab"
            id={`${id}-tab-${index}`}
            aria-controls={`${id}-panel-${index}`}
            aria-selected={selected === index}
            tabIndex={selected === index ? 0 : -1}
            className={styles.tab}
            onClick={() => setSelected(index)}
            onKeyDown={(event) => {
              let next: number;
              if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                next =
                  (index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) %
                  tabs.length;
              } else if (event.key === "Home") {
                next = 0;
              } else if (event.key === "End") {
                next = tabs.length - 1;
              } else {
                return;
              }
              event.preventDefault();
              setSelected(next);
              document.getElementById(`${id}-tab-${next}`)?.focus();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {[children, weekly, availability].map((content, index) => (
        <div
          key={index}
          role="tabpanel"
          id={`${id}-panel-${index}`}
          aria-labelledby={`${id}-tab-${index}`}
          hidden={selected !== index}
          tabIndex={0}
        >
          {content}
        </div>
      ))}
    </div>
  );
}
