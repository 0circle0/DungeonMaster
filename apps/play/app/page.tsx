/**
 * Entry point.
 *
 * A static shell, and deliberately nothing else. This file used to read every
 * module in `modules/` on the server and hand all of them to the client — which
 * meant Aurendel's 2.9 MB crossed on first paint whether or not anyone opened
 * it, and meant the app could not exist without a Node process behind it.
 *
 * Now the worlds live in the browser, the examples are static files fetched
 * when somebody asks for one, and there is nothing left for a server to do. The
 * app builds with `output: 'export'`, so reintroducing a server dependency here
 * is a build failure rather than a decision nobody notices.
 */

import { Play } from './Play';

export default function Page() {
  return <Play />;
}
