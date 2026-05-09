const MAX_SLUG_LENGTH = 100;

export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')     // remove non-word chars except spaces and hyphens
    .replace(/[\s_]+/g, '-')      // spaces and underscores to hyphens
    .replace(/-+/g, '-')          // collapse consecutive hyphens
    .replace(/^-+|-+$/g, '')      // trim leading/trailing hyphens
    .slice(0, MAX_SLUG_LENGTH);
}
