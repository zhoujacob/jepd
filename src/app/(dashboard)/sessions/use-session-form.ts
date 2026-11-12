"use client";

import { startTransition, useActionState, type SubmitEvent } from "react";
import type { SessionActionState } from "@/lib/sessions";

const initialState: SessionActionState = { error: "", success: "" };

type SessionAction = (
  previous: SessionActionState,
  data: FormData,
) => Promise<SessionActionState>;

// React clears a form after every <form action> submit, even one the server
// rejects, and never re-applies a changed defaultValue to a <select>. Submitting
// from onSubmit instead keeps what the exec typed or chose on screen.
export function useSessionForm(action: SessionAction, confirmMessage?: string) {
  const [state, dispatch, pending] = useActionState(action, initialState);

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    const data = new FormData(event.currentTarget);
    startTransition(() => dispatch(data));
  }

  return { state, pending, onSubmit };
}
