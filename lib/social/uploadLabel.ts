// What the Video Library's upload progress list CALLS a file.
//
// The operator types a property name on the upload form, then watches a progress list that used to
// name each row by its source filename — frequently a camera UUID, which tells them nothing about
// which video is which. This is the one rule that decides that label, and it lives here rather than
// inside the client component so it can be tested as a pure function.
//
// IT IS A LABEL, NOT AN IDENTIFIER. Nothing downstream reads it: the upload still sends the real
// `file.name` as `originalFilename`, still writes to the `contentId` storage path, and still
// renames nothing. Changing this function can only change what a human reads on screen.
export type UploadLabelInput = {
  /** The property name entered on the upload form. May be empty or whitespace. */
  propertyName: string
  file: { name: string }
}

/** The property name the operator entered, or the original filename when they left it blank —
 *  so a row is never blank, and never shows a UUID when a real name was given. */
export function uploadLabel(u: UploadLabelInput): string {
  return u.propertyName.trim() || u.file.name
}
