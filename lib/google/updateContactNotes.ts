import { google } from "googleapis";

type GoogleOAuthClient = InstanceType<typeof google.auth.OAuth2>;

/**
 * Updates only the biography (notes) field of an existing Google Contact.
 * All other contact fields (name, phone, email) are left untouched.
 *
 * @param googleContactId - The Google People API resourceName (e.g. "people/c1234567890")
 * @param notes           - The full notes string to write into the biography field
 * @param client          - The OWNING agent's OAuth client (never a global account)
 * @throws Error if the Google API call fails
 */
export async function updateGoogleContactNotes(
  googleContactId: string,
  notes: string,
  client: GoogleOAuthClient
): Promise<void> {
  // THE CALLER SUPPLIES THE ACCOUNT. This used to build a single global client from
  // GOOGLE_REFRESH_TOKEN, which does not exist in production — so every note update since that
  // variable was dropped has been a no-op. It is now the owning agent's own client, resolved
  // from the lead, which is both the reason it works and the reason it cannot write into
  // somebody else's contacts.
  const people = google.people({
    version: "v1",
    auth: client,
  });

  try {
    await people.people.updateContact({
      resourceName: googleContactId,
      updatePersonFields: "biographies",
      requestBody: {
        biographies: [
          {
            value: notes,
          },
        ],
      },
    });
  } catch (err) {
    throw new Error(
      `Google People API updateContact failed for ${googleContactId}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}
