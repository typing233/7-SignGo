import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FileText, LogOut } from 'lucide-react';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <Link to="/documents" className="flex items-center gap-2 text-xl font-bold text-blue-600">
          <FileText size={24} />
          SignGo
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-gray-600">{user?.name}</span>
          <button onClick={handleLogout} className="flex items-center gap-1 text-gray-500 hover:text-red-500">
            <LogOut size={18} />
            退出
          </button>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
