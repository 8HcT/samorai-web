import { redirect } from 'react-router';

export function loader() {
  return redirect('/the-dealers', 301);
}

export default function DealersLegacyRedirect() {
  return null;
}
