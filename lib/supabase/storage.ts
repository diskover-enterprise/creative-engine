// Public Supabase Storage URLs look like:
//   {SUPABASE_URL}/storage/v1/object/public/{bucket}/{path}
// This recovers {path} so we can delete the underlying object later.
export function getStoragePathFromPublicUrl(url: string, bucket: string) {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const index = url.indexOf(marker);
  if (index === -1) return null;
  return decodeURIComponent(url.slice(index + marker.length));
}
