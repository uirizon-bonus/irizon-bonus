
import React, { useMemo, useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Search, 
  Bell, 
  ChevronDown, 
  Menu, 
  Globe,
  Plus,
  Filter,
  ArrowRight,
  User as UserIcon,
  ShieldCheck,
  RefreshCw,
  TrendingUp
} from 'lucide-react';
import { MENU_ITEMS, NAV_GROUPS, COLORS, TRANSLATIONS } from './constants';
import { Language, Customer } from './types';
import irizonLogo from './src/data/Irizon-logo.png';
import DashboardView from './components/DashboardView';
import CustomersView from './components/CustomersView';
import GiftsView from './components/GiftsView';
import ProductsView from './components/ProductsView';
import RequestsView from './components/RequestsView';
import OrdersView from './components/OrdersView';
import ReconciliationView from './components/ReconciliationView';
import AuditLogView from './components/AuditLogView';
import UserPortal from './components/UserPortal';
import QrScansView from './components/QrScansView';
import QrManageView from './components/QrManageView';
import PointsMarketView from './components/PointsMarketView';
import PushNotificationsView from './components/PushNotificationsView';

const App: React.FC = () => {
  const isPortalApp = import.meta.env.MODE === 'portal';
  const PORTAL_CUSTOMER_ID_KEY = 'irizon_portal_customer_id';
  const APP_LANG_KEY = isPortalApp ? 'irizon_portal_lang' : 'irizon_lang';
  const location = useLocation();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'admin' | 'user'>(isPortalApp ? 'user' : 'admin');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [reconciliationCustomerId, setReconciliationCustomerId] = useState<string | null>(null);
  const [initialSelectedId, setInitialSelectedId] = useState<string | null>(null);
  const [lang, setLang] = useState<Language>('UZ');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const pointsMarketNavItem = useMemo(
    () => ({
      id: 'points-market',
      label: { EN: 'Points Market', RU: 'Рынок баллов', UZ: 'Ballar bozori' } as const,
      icon: <TrendingUp className="w-5 h-5" />,
      path: '/points-market',
    }),
    [],
  );
  const menuItems = useMemo(() => {
    if (MENU_ITEMS.some((item) => item.id === 'points-market')) {
      return MENU_ITEMS;
    }
    return [...MENU_ITEMS, pointsMarketNavItem];
  }, [pointsMarketNavItem]);
  const navGroups = useMemo(() => {
    if (NAV_GROUPS.some((group) => group.items.some((item) => item.id === 'points-market'))) {
      return NAV_GROUPS;
    }
    return NAV_GROUPS.map((group) => {
      if (!group.items.some((item) => item.id === 'orders')) {
        return group;
      }
      return {
        ...group,
        items: [group.items[0], pointsMarketNavItem, ...group.items.slice(1)],
      };
    });
  }, [pointsMarketNavItem]);
  
  const [portalCustomerId, setPortalCustomerId] = useState<string | null>(null);

  const tabToPath = useMemo(() => ({
    dashboard: '/dashboard',
    customers: '/customers',
    reconciliation: '/reconciliation',
    orders: '/orders',
    'points-market': '/points-market',
    gifts: '/gifts',
    products: '/products',
    'qr-scans': '/qr-scans',
    'qr-manage': '/qr-manage',
    'push-notifications': '/push-notifications',
    requests: '/requests',
    audit: '/audit',
  }), []);

  const pathToTab = (pathname: string) => {
    if (pathname.startsWith('/reconciliation')) return 'reconciliation';
    if (pathname.startsWith('/customers')) return 'customers';
    if (pathname.startsWith('/orders')) return 'orders';
    if (pathname.startsWith('/points-market')) return 'points-market';
    if (pathname.startsWith('/gifts')) return 'gifts';
    if (pathname.startsWith('/products')) return 'products';
    if (pathname.startsWith('/qr-scans')) return 'qr-scans';
    if (pathname.startsWith('/qr-manage')) return 'qr-manage';
    if (pathname.startsWith('/push-notifications')) return 'push-notifications';
    if (pathname.startsWith('/requests')) return 'requests';
    if (pathname.startsWith('/audit')) return 'audit';
    return 'dashboard';
  };

  // Language is fixed to Uzbek (RU/EN removed).
  useEffect(() => {
    if (localStorage.getItem(APP_LANG_KEY) !== 'UZ') {
      localStorage.setItem(APP_LANG_KEY, 'UZ');
    }
    setLang('UZ');
  }, [APP_LANG_KEY]);

  useEffect(() => {
    const savedPortalCustomerId = localStorage.getItem(PORTAL_CUSTOMER_ID_KEY);
    if (savedPortalCustomerId) {
      setPortalCustomerId(savedPortalCustomerId);
    }
  }, []);

  useEffect(() => {
    const pathname = location.pathname || '/';
    if (pathname === '/' || pathname === '') {
      navigate(tabToPath.dashboard, { replace: true });
      return;
    }

    if (pathname.startsWith('/portal')) {
      const segments = pathname.split('/').filter(Boolean);
      const nextCustomerId = segments[1] || null;
      if (nextCustomerId) {
        setPortalCustomerId(nextCustomerId);
        localStorage.setItem(PORTAL_CUSTOMER_ID_KEY, nextCustomerId);
      }
      setViewMode('user');
      return;
    }

    if (viewMode !== 'admin') {
      setViewMode('admin');
    }

    if (pathname.startsWith('/reconciliation/')) {
      const segments = pathname.split('/').filter(Boolean);
      const nextId = segments[1] || null;
      setReconciliationCustomerId(nextId);
      setActiveTab('reconciliation');
      return;
    }

    setActiveTab(pathToTab(pathname));
  }, [location.pathname, navigate, tabToPath, viewMode]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const selectedId = params.get('selectedId');
    if (selectedId) {
      setInitialSelectedId(selectedId);
    }
  }, [location.search]);

  const openPortalForCustomer = (customerId: string) => {
    setPortalCustomerId(customerId);
    localStorage.setItem(PORTAL_CUSTOMER_ID_KEY, customerId);
    setViewMode('user');
    navigate(`/portal/${customerId}`);
  };

  const handlePortalAuthenticated = (customerId: string) => {
    setPortalCustomerId(customerId);
    localStorage.setItem(PORTAL_CUSTOMER_ID_KEY, customerId);
  };

  const handlePortalLogout = () => {
    setPortalCustomerId(null);
    localStorage.removeItem(PORTAL_CUSTOMER_ID_KEY);
    if (!isPortalApp) {
      navigate(tabToPath.dashboard);
    }
  };

  const changeLang = (newLang: Language) => {
    if (isPortalApp && newLang === 'EN') {
      return;
    }
    setLang(newLang);
    localStorage.setItem(APP_LANG_KEY, newLang);
  };

  const renderAdminContent = () => {
    switch (activeTab) {
      case 'dashboard': return <DashboardView lang={lang} />;
      case 'customers': return (
        <CustomersView 
          lang={lang} 
          onOpenReconciliation={(id) => {
            setReconciliationCustomerId(id);
            setActiveTab('reconciliation');
          }}
          onOpenPortal={openPortalForCustomer}
        />
      );
      case 'reconciliation': 
        return reconciliationCustomerId ? (
          <ReconciliationView 
            lang={lang} 
            customerId={reconciliationCustomerId} 
            onBack={() => navigate(tabToPath.customers)}
            onNavigate={(tab, id) => {
              setInitialSelectedId(id);
              if (tab === 'reconciliation' && id) {
                navigate(`/reconciliation/${id}`);
              } else {
                navigate(`${tabToPath[tab as keyof typeof tabToPath] || tabToPath.dashboard}?selectedId=${id ?? ''}`);
              }
            }}
          />
        ) : null;
      case 'orders': return <OrdersView lang={lang} initialSelectedId={initialSelectedId} />;
      case 'points-market': return <PointsMarketView lang={lang} />;
      case 'gifts': return <GiftsView lang={lang} />;
      case 'products': return <ProductsView lang={lang} />;
      case 'qr-scans': return <QrScansView lang={lang} />;
      case 'qr-manage': return <QrManageView lang={lang} />;
      case 'push-notifications': return <PushNotificationsView lang={lang} />;
      case 'requests': return <RequestsView lang={lang} initialSelectedId={initialSelectedId} />;
      case 'audit': return <AuditLogView lang={lang} />;
      default: return <div className="p-8 text-center text-slate-400">Section coming soon...</div>;
    }
  };

  const getBreadcrumbs = () => {
    if (activeTab === 'reconciliation') {
      return [
        { label: 'Admin', path: '#' },
        { label: TRANSLATIONS[lang].customers, path: '#' },
        { label: TRANSLATIONS[lang].reconciliation, path: '#' }
      ];
    }
    const item = menuItems.find(m => m.id === activeTab);
    return [
      { label: 'Admin', path: '#' },
      { label: item ? item.label[lang] : 'Dashboard', path: '#' }
    ];
  };

  if (viewMode === 'user') {
    return (
      <UserPortal 
        customerId={portalCustomerId}
        onSwitchView={() => setViewMode(isPortalApp ? 'user' : 'admin')} 
        onAuthenticated={handlePortalAuthenticated}
        onLogout={handlePortalLogout}
        onChangeLang={changeLang}
        lang={lang}
      />
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50 overflow-hidden font-inter">
      {/* View Switcher Floating Button */}
      {!isPortalApp && (
        <button 
          onClick={() => setViewMode('user')}
          className="fixed bottom-6 right-6 z-[100] flex items-center gap-2 px-4 py-3 bg-indigo-600 text-white font-bold rounded-full shadow-2xl hover:bg-indigo-700 hover:scale-105 active:scale-95 transition-all group"
        >
          <UserIcon className="w-5 h-5" />
          <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-500 whitespace-nowrap">{TRANSLATIONS[lang].switch_to_portal}</span>
        </button>
      )}

      {/* Sidebar - Enterprise SaaS Style */}
      <aside className={`${isSidebarOpen ? 'w-64' : 'w-20'} sidebar-gradient transition-all duration-300 flex flex-col z-50`}>
        {/* Branding Area */}
        <div className="p-6 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center shadow-md shadow-cyan-500/10 overflow-hidden">
            <img src={irizonLogo} alt="IRIZON" className="w-8 h-8 object-contain" />
          </div>
          {isSidebarOpen && (
            <div className="flex flex-col">
              <span className="text-white font-bold tracking-tight text-base">IRIZON</span>
              <span className="text-slate-500 text-[10px] font-medium leading-none uppercase tracking-wide">Admin</span>
            </div>
          )}
        </div>

        {/* Navigation - Workflow Focused */}
        <nav className="flex-1 mt-2 px-3 space-y-6 overflow-y-auto custom-scrollbar pb-10">
          {navGroups.map((group) => (
            <div key={group.title[lang]} className="space-y-1">
              {isSidebarOpen && (
                <h3 className="px-3 py-2 text-[10px] font-bold text-slate-400 tracking-[0.1em] uppercase opacity-40">
                  {group.title[lang]}
                </h3>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setInitialSelectedId(null);
                      navigate(tabToPath[item.id as keyof typeof tabToPath] || tabToPath.dashboard);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all group ${
                      activeTab === item.id 
                        ? 'bg-white/5 text-white border-l-2 border-cyan-500 rounded-none rounded-r-lg' 
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border-l-2 border-transparent'
                    }`}
                  >
                    <div className={`${activeTab === item.id ? 'text-cyan-400' : 'text-slate-500 group-hover:text-slate-300'} transition-colors shrink-0`}>
                      {React.cloneElement(item.icon as React.ReactElement, { className: 'w-[18px] h-[18px]' })}
                    </div>
                    {isSidebarOpen && <span className="font-medium text-[13px] text-left truncate">{item.label[lang]}</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-white/5">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="w-full flex items-center justify-center p-2 text-slate-500 hover:text-slate-300 hover:bg-white/5 rounded-lg transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Simplified Enterprise Header */}
        <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between sticky top-0 z-40">
          <div className="flex items-center gap-4">
            <h1 className="text-sm font-bold text-slate-900">
              {menuItems.find(m => m.id === activeTab)?.label[lang]}
            </h1>
            <div className="h-4 w-px bg-slate-200 hidden md:block"></div>
            <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-400">
              {getBreadcrumbs().map((bc, idx) => (
                <React.Fragment key={idx}>
                  <span className="hover:text-slate-600 transition-colors cursor-pointer">{bc.label}</span>
                  {idx < getBreadcrumbs().length - 1 && <span>/</span>}
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-5">
            {/* Minimal Search */}
            <div className="relative group hidden lg:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 group-focus-within:text-cyan-500 transition-colors" />
              <input 
                type="text"
                placeholder={TRANSLATIONS[lang].jump_to}
                className="pl-9 pr-4 py-1.5 w-48 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-cyan-500/20 focus:bg-white focus:border-cyan-500/30 transition-all outline-none"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>


            <button className="relative p-1.5 text-slate-400 hover:text-slate-900 transition-all">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-cyan-500 rounded-full"></span>
            </button>
            
            <div className="flex items-center gap-3 cursor-pointer group border-l border-slate-100 pl-4 ml-1">
              <div className="flex flex-col text-right">
                <span className="text-[11px] font-bold text-slate-900 leading-tight">Aziz Z.</span>
                <span className="text-[9px] text-slate-400 font-medium uppercase tracking-widest">Admin</span>
              </div>
              <div className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center ring-2 ring-white">
                <span className="text-white font-bold text-[10px]">AZ</span>
              </div>
            </div>
          </div>
        </header>

        {/* Main Workspace Container */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {renderAdminContent()}
        </div>
      </main>
    </div>
  );
};

export default App;
