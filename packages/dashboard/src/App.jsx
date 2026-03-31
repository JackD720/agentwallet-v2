import { useState, useEffect } from "react";
import Dashboard from './components/Dashboard';
import Connections from './components/Connections';

export default function App() {
  const [page, setPage] = useState(window.location.hash === '#settings' ? 'connections' : 'dashboard');

  useEffect(() => {
    const handleHash = () => {
      setPage(window.location.hash === '#settings' ? 'connections' : 'dashboard');
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  return page === 'connections' ? <Connections /> : <Dashboard />;
}
