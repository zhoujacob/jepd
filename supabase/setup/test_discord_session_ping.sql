-- Apply the initial schema first; this script sends real TEST RUN messages.
-- Run in Supabase SQL Editor as the project owner. No email, date, or time to fill in.
-- Finds the next session that has not started, including ungenerated recurring dates.
-- Simulates 6 p.m. the day before that session, using CURRENT availability/defaults.
-- 0 Yes: asks for coverage. 1 Yes: asks for backup. 2+ Yes: sends nothing.
-- No upcoming session: sends nothing. It does not skip a covered session to find another.
-- Any message is labeled TEST RUN and really pings @everyone plus linked Yes attendees.
-- Each eligible execution sends again; normal reminder history and Cron timing are untouched.
select private.test_next_discord_session() as test_result;

-- Result includes the selected session, yes_count, queued, request_ids, and explanation.
-- After committing, wait a few seconds and run separately using an ID from request_ids:
-- select status_code, error_msg from net._http_response where id = 123;
-- HTTP 200 means Discord accepted the message; no row yet means pending.
