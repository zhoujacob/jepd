"use server";

import { revalidatePath } from "next/cache";
import { requireExec } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  isWeek,
  sessionInputError,
  sessionTimeError,
  weekStart,
  type SessionActionState,
} from "@/lib/sessions";

const text = (data: FormData, key: string) => String(data.get(key) ?? "");
const isId = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const failure = (error: string): SessionActionState => ({ error, success: "" });
function success(message: string): SessionActionState {
  revalidatePath("/sessions");
  return { error: "", success: message };
}

export async function addSession(
  _previous: SessionActionState,
  data: FormData,
): Promise<SessionActionState> {
  await requireExec();
  const date = text(data, "date");
  const start = text(data, "start");
  const end = text(data, "end");
  const week = text(data, "week");
  const invalid = sessionInputError(date, start, end);
  if (invalid) return failure(invalid);
  // Keep additions on the week being viewed.
  if (!isWeek(week) || weekStart(date) !== week)
    return failure("Choose a date in the displayed week.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_extra_session", {
    target_date: date,
    start_time: start,
    end_time: end,
  });
  if (error)
    return failure(
      error.code === "23505"
        ? "That session already exists."
        : "Unable to add the session. Please try again.",
    );
  return success("Session added.");
}

export async function saveSchedule(
  _previous: SessionActionState,
  data: FormData,
): Promise<SessionActionState> {
  await requireExec();
  const day = Number(text(data, "weekday"));
  const start = text(data, "start");
  const end = text(data, "end");
  const id = text(data, "schedule_id");
  const invalid = sessionTimeError(start, end);
  if (invalid) return failure(invalid);
  if (!Number.isInteger(day) || day < 1 || day > 7 || (id && !isId(id)))
    return failure("Choose a valid weekly session.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_session_schedule", {
    day_number: day,
    start_time: start,
    end_time: end,
    replacing_id: id || null,
  });
  if (error)
    return failure(
      error.code === "23505"
        ? "That weekly session already exists."
        : "Unable to save this schedule. Refresh and check your access.",
    );
  return success(
    id
      ? "Weekly schedule saved. Changes to the day or time require fresh availability."
      : "Weekly session added. It repeats from today onward.",
  );
}

export async function stopSchedule(
  _previous: SessionActionState,
  data: FormData,
): Promise<SessionActionState> {
  await requireExec();
  const id = text(data, "schedule_id");
  if (!isId(id)) return failure("Invalid schedule.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("stop_session_schedule", {
    target_schedule: id,
  });
  if (error)
    return failure(
      "Unable to stop this schedule. Refresh and check your access.",
    );
  return success("Schedule stopped from today onward.");
}

export async function cancelSession(
  _previous: SessionActionState,
  data: FormData,
): Promise<SessionActionState> {
  await requireExec();
  const id = text(data, "session_id");
  if (!isId(id)) return failure("Invalid session.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_club_session", {
    target_session: id,
  });
  if (error)
    return failure(
      "Unable to cancel this session. Refresh and check your access.",
    );
  return success("This date is cancelled. Other weeks are unchanged.");
}

export async function saveDefaults(
  _previous: SessionActionState,
  data: FormData,
): Promise<SessionActionState> {
  await requireExec();
  const choices = [];
  for (const [key, value] of data.entries()) {
    if (!key.startsWith("schedule:")) continue;
    const id = key.slice(9);
    if (
      !isId(id) ||
      typeof value !== "string" ||
      !["", "yes", "maybe", "no"].includes(value)
    )
      return failure("Choose valid availability defaults.");
    choices.push({ schedule_id: id, response: value });
  }
  if (choices.length > 100) return failure("Too many weekly sessions.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_session_defaults", { choices });
  if (error)
    return failure(
      "Unable to save defaults. The schedule may have changed; refresh and try again.",
    );
  return success(
    "Defaults saved. Unanswered upcoming dates will fill automatically; existing answers stay unchanged.",
  );
}

export async function saveAvailability(
  data: FormData,
): Promise<SessionActionState> {
  await requireExec();
  const id = text(data, "session_id");
  const response = text(data, "response");
  if (!isId(id) || !["", "yes", "maybe", "no"].includes(response))
    return failure("Choose a valid response.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_session_availability", {
    target_session: id,
    new_response: response || null,
  });
  if (error)
    return failure(
      error.code === "P0001"
        ? error.message
        : "Unable to save. Please try again.",
    );
  // The board updates its saved cell/count locally; no full-page database reload.
  return { error: "", success: "Saved." };
}

export async function updateSessionTime(
  _previous: SessionActionState,
  data: FormData,
): Promise<SessionActionState> {
  await requireExec();
  const id = text(data, "session_id");
  const start = text(data, "start");
  const end = text(data, "end");
  if (!isId(id)) return failure("Invalid session.");
  const invalid = sessionTimeError(start, end);
  if (invalid) return failure(invalid);
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_session_time", {
    target_session: id,
    start_time: start,
    end_time: end,
  });
  if (error)
    return failure(
      error.code === "23505"
        ? "A session at that time already exists on this date."
        : "Unable to update this session. Refresh and check your access.",
    );
  return success(
    "Time saved for this date. Changed times require fresh availability.",
  );
}
