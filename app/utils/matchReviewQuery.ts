export function matchReviewQuery(
  q: string,
  propertyName?: string | null
) {
  if (!q) return true;
  if (!propertyName) return false;

  return propertyName
    .toLowerCase()
    .includes(q.toLowerCase());
}
