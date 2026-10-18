import { Redirect } from 'expo-router';

// Any address the app does not know (an old link, or the page opened under another path) starts at the beginning.
export default function NotFound() {
  return <Redirect href="/" />;
}
