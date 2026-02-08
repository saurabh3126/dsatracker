import { Outlet, useLocation } from 'react-router-dom';
import { Github, Linkedin, Mail } from 'lucide-react';
import Navbar from './Navbar.jsx';

export default function AppLayout() {
  const { pathname } = useLocation();
  const isAdd = pathname.startsWith('/add');
  const isHome = pathname === '/';
  const isAuth = pathname === '/login' || pathname === '/signup';

  return (
    <div
      className={
        (isAdd ? 'dsa-bg-add' : 'dsa-bg') +
        ' flex min-h-screen flex-col overflow-x-hidden bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900'
      }
    >
      <Navbar />
      <main
        className={
          (isHome ? 'pb-0' : isAuth ? 'pb-0' : 'pb-16') +
          ' flex-1 pt-[72px]' +
          (isAuth ? ' flex items-center' : '')
        }
      >
        <Outlet />
      </main>
      
      {isAuth ? null : (
        <footer className="border-t border-white/5 bg-[#05070a]/50 py-8 sm:py-12 backdrop-blur-xl">
          <div className="mx-auto max-w-7xl px-4 text-center">
              <p className="text-sm font-bold tracking-widest text-amber-500 uppercase mb-6 italic">
                  Built with 💗 for DSA Enthusiasts
              </p>
              <div className="flex justify-center gap-6">
                  <a href="https://github.com/saurabh3126" target="_blank" rel="noreferrer" className="text-slate-400 hover:text-white transition-colors">
                      <Github className="h-5 w-5" />
                  </a>
                  <a href="https://www.linkedin.com/in/saurabh316/" target="_blank" rel="noreferrer" className="text-slate-400 hover:text-white transition-colors">
                      <Linkedin className="h-5 w-5" />
                  </a>
                  <a href="mailto:saurabh239goswami@gmail.com" className="text-slate-400 hover:text-white transition-colors">
                      <Mail className="h-5 w-5" />
                  </a>
              </div>
          </div>
        </footer>
      )}
    </div>
  );
}
