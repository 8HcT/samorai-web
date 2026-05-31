import { redirect } from 'react-router';

export function loader() {
  return redirect('/wheels', 301);
}

export default function ShopRedirect() {
  return null;
}
