"use client";

import { useFormStatus } from "react-dom";
import { discordStyles as styles } from "./discord-styles";

export function ConnectionButton({
  disconnect = false,
}: {
  disconnect?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className={styles.button}>
      {pending
        ? "Please wait…"
        : disconnect
          ? "Disconnect Discord"
          : "Connect Discord"}
    </button>
  );
}
