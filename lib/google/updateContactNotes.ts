import { google } from "googleapis";
// LEGACY global Google account — TODO(phase-2): migrate to per-user
// google_credentials. See getOAuthClient.ts. Do not extend this path.
import { getOAuthClient } from "./getOAuthClient";

/**
 * Updates only the biography (notes) field of an existing Google Contact.
 * All other contact fields (name, phone, email) are left untouched.
 *
 * @param googleContactId - The Google People API resourceName (e.g. "people/c1234567890")
 * @param notes           - The full notes string to write into the biography field
 * @throws Error if the Google API call fails
 */
export async function updateGoogleContactNotes(
  googleContactId: string,
  notes: string
): Promise<void> {
  const oauth2Client = getOAuthClient();

  const people = google.people({
    version: "v1",
    auth: oauth2Client,
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
