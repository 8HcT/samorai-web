import { redirect } from 'react-router';

export function loader() {
  return redirect('/contacto', 301);
}

export default function SupportLegacyRedirect() {
  return null;
}
