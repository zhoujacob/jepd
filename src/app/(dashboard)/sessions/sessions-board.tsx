"use client";

import { useState } from "react";
import {
  formatDate,
  formatTime,
  formatWeekRange,
  sessionLabel,
  type Availability,
  type ClubSession,
  type SessionExec,
  type SessionResponse,
} from "@/lib/sessions";
import { AvailabilityCell, AvailabilityLegend } from "./availability-controls";
import { sessionStyles as styles } from "./session-styles";

export function SessionsBoard({
  week,
  sessions,
  roster,
  initialResponses,
  userId,
}: {
  week: string;
  sessions: ClubSession[];
  roster: SessionExec[];
  initialResponses: SessionResponse[];
  userId: string;
}) {
  const [savedResponses, setSavedResponses] = useState(initialResponses);
  const responses = new Map(
    savedResponses.map((response) => [
      `${response.session_id}:${response.user_id}`,
      response.response,
    ]),
  );

  function saveResponse(sessionId: string, response: Availability | "") {
    setSavedResponses((current) => {
      const others = current.filter(
        (item) => item.session_id !== sessionId || item.user_id !== userId,
      );
      return response
        ? [...others, { session_id: sessionId, user_id: userId, response }]
        : others;
    });
  }

  return (
    <>
      <AvailabilityLegend />
      <p id="board-help" className={styles.boardHelp}>
        Select a cell in your row to update your availability. Changes save
        automatically. Scroll sideways to see every session.
      </p>
      <div
        role="region"
        aria-label="Weekly availability board"
        aria-describedby="board-help"
        tabIndex={0}
        className={styles.boardScroll}
      >
        <table className={styles.table}>
          <caption className={styles.srOnly}>
            Exec availability for {formatWeekRange(week)}
          </caption>
          <thead>
            <tr className={styles.headerRow}>
              <th scope="col" className={styles.corner}>
                <span className={styles.srOnly}>Exec</span>
              </th>
              {sessions.map((session) => {
                const label = sessionLabel(session);
                return (
                  <th
                    key={session.id}
                    scope="col"
                    className={styles.sessionHeader}
                    title={label}
                  >
                    <div>
                      {new Intl.DateTimeFormat("en-CA", {
                        weekday: "long",
                        timeZone: "UTC",
                      }).format(new Date(`${session.session_date}T12:00:00Z`))}
                    </div>
                    <div className={styles.sessionTime}>
                      {formatTime(session.starts_at)
                        .replace(":00", "")
                        .replace(" ", "")}{" "}
                      -{" "}
                      {formatTime(session.ends_at)
                        .replace(":00", "")
                        .replace(" ", "")}
                    </div>
                    <span className={styles.srOnly}>
                      {formatDate(session.session_date)}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {roster.map((exec) => (
              <tr key={exec.user_id} className={styles.row}>
                <th
                  scope="row"
                  className={styles.nameCell}
                  title={`${exec.display_name} (${exec.email})`}
                >
                  <span className={styles.name}>
                    {exec.display_name}
                    {exec.user_id === userId && (
                      <span className={styles.youLabel}>(you)</span>
                    )}
                  </span>
                  {exec.display_name !== exec.email && (
                    <span className={styles.srOnly}>{exec.email}</span>
                  )}
                </th>
                {sessions.map((session) => {
                  const response =
                    responses.get(`${session.id}:${exec.user_id}`) ?? "";
                  return (
                    <td key={session.id} className={styles.responseCell}>
                      <AvailabilityCell
                        sessionId={session.id}
                        response={response}
                        editable={exec.user_id === userId}
                        onSaved={saveResponse}
                        label={`${formatDate(session.session_date, true)} at ${formatTime(session.starts_at)}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className={styles.countRow}>
              <th scope="row" className={styles.countLabel}>
                Available
              </th>
              {sessions.map((session) => (
                <td key={session.id} className={styles.count}>
                  {
                    roster.filter(
                      (exec) =>
                        responses.get(`${session.id}:${exec.user_id}`) ===
                        "yes",
                    ).length
                  }
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}
