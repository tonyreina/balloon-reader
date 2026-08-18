// Where is this copy of the game running?
//
// Custom sentences are only offered when the game is served from the machine it
// is played on. Published online — GitHub Pages or anywhere else — the feature is
// hidden entirely.
//
// The reason is not that one visitor could see another's sentences: they are kept
// in localStorage, which is private to a single browser on a single origin, so
// nothing typed on one device can reach another. The reason is the shared device.
// On a classroom or library computer, whatever one child types is still there for
// the next child who sits down. Somebody has to be accountable for what a child is
// asked to read aloud, and that can only be the person who owns the computer the
// game is running on.

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0', '']);

export function isLocalCopy(location = window.location) {
  if (location.protocol === 'file:') return true;
  const host = (location.hostname || '').toLowerCase();
  if (LOCAL_HOSTS.has(host)) return true;
  // A machine's own name on a home network, e.g. "kitchen-pc.local".
  return host.endsWith('.local');
}

// Deliberately not overridable by a query string or a stored setting: a flag in
// the URL is exactly the sort of thing that gets passed around a classroom.
export function canAddOwnSentences(location = window.location) {
  return isLocalCopy(location);
}
