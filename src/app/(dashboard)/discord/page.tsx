import { requireExec } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getDiscordConfig } from "@/lib/discord";
import { connectDiscord, disconnectDiscord } from "./actions";
import { ConnectionButton } from "./connection-button";
import { discordStyles as styles } from "./discord-styles";

export const metadata = { title: "Discord account" };
const errors: Record<string, string> = {
  setup:
    "Discord connections are not configured yet. Contact the site maintainer.",
  access:
    "Unable to save the connection. Your access may have changed; try signing in again.",
  state:
    "This connection request expired or belongs to another login. Please start again.",
  cancelled:
    "Discord connection cancelled. Your current connection is unchanged.",
  oauth: "Unable to verify your Discord account. Please try again.",
  used: "That Discord account is already connected to another exec.",
  disconnect: "Unable to disconnect Discord. Please try again.",
};

export default async function DiscordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; status?: string }>;
}) {
  const user = await requireExec();
  const params = await searchParams;
  const supabase = await createClient();
  const { data: connection, error } = await supabase
    .from("discord_connections")
    .select("discord_username")
    .eq("user_id", user.id)
    .maybeSingle();
  const configured = Boolean(getDiscordConfig());
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">WORKSPACE</p>
        <h1>Discord account</h1>
        <p>
          Connect your account to get mentioned when you sign up for a session.
        </p>
      </div>
      <section className={styles.panel} aria-label="Discord connection">
        {params.error && (
          <p className="form-error" role="alert">
            {errors[params.error] ?? errors.oauth}
          </p>
        )}
        {params.status === "disconnected" && (
          <p role="status">Discord disconnected.</p>
        )}
        {params.status === "connected" && connection && (
          <p role="status">Discord connected.</p>
        )}
        {error ? (
          <p className="form-error" role="alert">
            Unable to load your connection. Ask the maintainer to check the
            Discord account migration.
          </p>
        ) : connection ? (
          <>
            <p>
              Connected as <strong>{connection.discord_username}</strong>
            </p>
            <form action={disconnectDiscord}>
              <ConnectionButton disconnect />
            </form>
          </>
        ) : configured ? (
          <form action={connectDiscord}>
            <ConnectionButton />
          </form>
        ) : (
          <p>{errors.setup}</p>
        )}
        <p className={styles.help}>
          Google remains your login. Discord is optional and is only used for
          session mentions. You must already have access to the club’s Discord
          channel to receive them.
        </p>
        <p className={styles.help}>
          Removing club access deletes this connection. It does not change your
          Discord server membership or roles.
        </p>
      </section>
    </>
  );
}
