import { Package, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { usePortal } from "../context/PortalContext";
import { LoadingScreen } from "../components/LoadingScreen";

const translations = {
  RU: {
    title: "Товары",
    subtitle: "Список товаров и начисляемых баллов",
    search: "Поиск товаров...",
    points: "баллов",
    noProducts: "Товары не найдены",
    noProductsDesc: "Попробуйте изменить поисковый запрос",
  },
  UZ: {
    title: "Mahsulotlar",
    subtitle: "Mahsulotlar va ular uchun ballar ro'yxati",
    search: "Mahsulot qidirish...",
    points: "ball",
    noProducts: "Mahsulotlar topilmadi",
    noProductsDesc: "Qidiruv so'rovini o'zgartirib ko'ring",
  },
} as const;

export function Products() {
  const { language } = useLanguage();
  const { loading, products } = usePortal();
  const [query, setQuery] = useState("");
  const t = translations[language];

  const filteredProducts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return products;
    return products.filter((product) => {
      const text = `${product.id} ${product.name} ${product.category}`.toLowerCase();
      return text.includes(needle);
    });
  }, [products, query]);

  if (loading) {
    return <LoadingScreen title={t.title} subtitle={t.subtitle} />;
  }

  return (
    <div className="min-h-screen bg-[#F5F7FB] pb-24">
      <div className="bg-gradient-to-r from-[#0F4C81] via-[#1E6FD9] to-[#2F8DE4] text-white px-5 pt-12 pb-6">
        <h1 className="text-2xl font-bold mb-1">{t.title}</h1>
        <p className="text-white/80 text-sm">{t.subtitle}</p>
      </div>

      <div className="px-5 -mt-2">
        <div className="relative mb-4">
          <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.search}
            className="w-full pl-11 pr-4 py-3 bg-white border border-gray-100 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-[#1E6FD9]/20"
          />
        </div>

        {filteredProducts.length ? (
          <div className="space-y-3">
            {filteredProducts.map((product) => (
              <div
                key={product.id}
                className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center justify-between"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 text-sm truncate">{product.name}</p>
                  <p className="text-xs text-gray-400 mt-1">{product.id}</p>
                </div>
                <div className="text-right pl-3 shrink-0">
                  <p className="text-xl font-black text-[#1E6FD9]">{product.pointsValue}</p>
                  <p className="text-[11px] text-gray-500 font-semibold">{t.points}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-[#1E6FD9]/10 text-[#1E6FD9] flex items-center justify-center mb-3">
              <Package className="w-7 h-7" />
            </div>
            <h3 className="font-bold text-gray-900">{t.noProducts}</h3>
            <p className="text-sm text-gray-500 mt-1">{t.noProductsDesc}</p>
          </div>
        )}
      </div>
    </div>
  );
}

