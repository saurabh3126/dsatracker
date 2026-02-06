import { Outlet, useLocation } from 'react-router-dom';
import Navbar from './Navbar.jsx';

export default function AppLayout() {
  const { pathname } = useLocation();
  const isAdd = pathname.startsWith('/add');

  return (
    <div className={isAdd ? 'dsa-bg-add' : 'dsa-bg'}>
      <Navbar />
      <main className={isAdd ? 'pb-16' : 'pb-16'}>
        <Outlet />
      </main>
    </div>
  );
}
