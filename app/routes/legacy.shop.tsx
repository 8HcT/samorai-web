import { redirect } from 'react-router';

export function loader() {
  return redirect('/the-wheels', 301);
}

export default function ShopLegacyRedirect() {
  return null;
}
